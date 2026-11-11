from sqlalchemy import select
from test_marketplace import account, listing, checkout
from app.db import SessionLocal
from app.models import User, Listing, Photo, AccountCleanup
from app.main import uploads
from app import chat
from app.account_cleanup import cleanup_account


def test_details_location_and_password_rotation(client):
    headers, profile, credentials = account(client, 'farmer')
    other = client.post('/auth/login', json={'email':credentials['email'],'password':credentials['password']}).json()['token']
    assert client.get('/health').json()['apiVersion'] == 3
    assert client.get('/me',headers=headers).json()['email'] == credentials['email']
    data = {key:profile[key] for key in ['name','phone','alternate','area','produce']}
    data.update(name='Updated farmer',area='Ruiru')
    assert client.patch('/me',headers=headers,json={**data,'role':'buyer'}).status_code == 422
    assert client.patch('/me',headers=headers,json={**data,'alternate':''}).status_code == 422
    updated = client.patch('/me',headers=headers,json=data)
    assert updated.status_code == 200 and updated.json()['name'] == 'Updated farmer'
    assert client.delete('/me/location',headers=headers).status_code == 204
    assert 'latitude' not in client.get('/me',headers=headers).json()
    assert client.patch('/me/location',headers=headers,json={'latitude':-1,'longitude':36,'area':'Ruiru','consent':True}).status_code == 200
    password = {'currentPassword':'wrong','newPassword':'NewStrongPassword123!'}
    assert client.post('/me/password',headers=headers,json=password).status_code == 403
    password['currentPassword']=credentials['password']
    result = client.post('/me/password',headers=headers,json=password)
    assert result.status_code == 200, result.text
    new_headers = {'Authorization':'Bearer '+result.json()['token']}
    assert client.get('/me',headers=new_headers).status_code == 200
    assert client.get('/me',headers=headers).status_code == 401
    assert client.get('/me',headers={'Authorization':'Bearer '+other}).status_code == 401
    assert client.post('/auth/login',json={'email':credentials['email'],'password':credentials['password']}).status_code == 401
    assert client.post('/auth/login',json={'email':credentials['email'],'password':password['newPassword']}).status_code == 200


def test_buyer_deletion_cancels_reservations_and_preserves_shared_history(client, monkeypatch):
    farmer, _, _ = account(client,'farmer')
    buyer, bp, credentials = account(client)
    calls=[]
    monkeypatch.setattr(chat,'delete_account_data',lambda user_id:calls.append(user_id))
    item = listing(client,farmer,quantity=10)
    order = checkout(client,buyer,[{'listingId':item['id'],'quantity':3}]).json()[0]
    assert client.request('DELETE','/me',headers=buyer,json={'password':'wrong','confirmation':'DELETE'}).status_code == 403
    assert client.request('DELETE','/me',headers=buyer,json={'password':credentials['password'],'confirmation':'delete'}).status_code == 422
    result = client.request('DELETE','/me',headers=buyer,json={'password':credentials['password'],'confirmation':'DELETE'})
    assert result.status_code == 202, result.text
    assert calls == [bp['id']]
    assert client.get('/me',headers=buyer).status_code == 401
    assert client.post('/auth/login',json={'email':credentials['email'],'password':credentials['password']}).status_code == 401
    shared = client.get('/orders',headers=farmer).json()[0]
    assert shared['id'] == order['id'] and shared['status'] == 'Cancelled'
    assert shared['buyerName'] == 'Deleted account'
    assert client.get('/listings?mine=true',headers=farmer).json()[0]['quantity'] == 10
    with SessionLocal() as db:
        user=db.get(User,bp['id'])
        assert user.deleted_at is not None and user.name=='Deleted account'
        assert user.phone == '' and user.email != credentials['email']
        assert db.get(AccountCleanup,bp['id']) is None
    assert client.post('/auth/register',json=credentials).status_code == 201, 'old email is released for a new account'


def test_farmer_deletion_scrubs_snapshots_and_retries_external_cleanup(client, monkeypatch):
    farmer, fp, credentials = account(client,'farmer')
    buyer, _, _ = account(client)
    item=listing(client,farmer,quantity=20)
    completed=checkout(client,buyer,[{'listingId':item['id'],'quantity':2}]).json()[0]
    client.patch('/orders/'+completed['id'],headers=farmer,json={'status':'Confirmed'})
    client.patch('/orders/'+completed['id'],headers=farmer,json={'status':'Completed'})
    pending=checkout(client,buyer,[{'listingId':item['id'],'quantity':3}]).json()[0]
    with SessionLocal() as db:
        path=db.scalar(select(Photo.path).where(Photo.owner_id==fp['id']))
    file=uploads/path.rsplit('/',1)[-1]
    assert file.exists()
    def unavailable(user_id):
        raise RuntimeError('simulated Firebase outage')
    monkeypatch.setattr(chat,'delete_account_data',unavailable)
    response=client.request('DELETE','/me',headers=farmer,json={'password':credentials['password'],'confirmation':'DELETE'})
    assert response.status_code == 202,response.text
    assert client.get('/listings',headers=buyer).json()==[]
    assert client.post('/chat/conversations',headers=buyer,json={'recipientId':fp['id']}).status_code==404
    assert client.post('/reviews',headers=buyer,json={'farmerId':fp['id'],'rating':5,'text':'Test'}).status_code==403
    orders={o['id']:o for o in client.get('/orders',headers=buyer).json()}
    assert orders[completed['id']]['status']=='Completed' and orders[completed['id']]['total']==160
    assert orders[pending['id']]['status']=='Cancelled'
    for order in orders.values():
        snapshot=order['items'][0]['listing']
        assert snapshot['seller']=='Deleted account' and snapshot['phone']=='' and snapshot['area']==''
        assert 'image' not in snapshot
    with SessionLocal() as db:
        assert db.get(AccountCleanup,fp['id']) is not None
        assert db.get(Listing,item['id']).quantity==0
        assert db.get(User,fp['id']).latitude is None
    assert file.exists(), 'external failure leaves durable cleanup work'
    monkeypatch.setattr(chat,'delete_account_data',lambda user_id:None)
    cleanup_account(fp['id'])
    assert not file.exists()
    with SessionLocal() as db:
        assert db.get(AccountCleanup,fp['id']) is None



def test_passwords_preserve_intentional_spaces(client):
    headers, _, credentials = account(client, password='  OriginalPassword123!  ')
    replacement = '  NewPassword123!  '
    response = client.post('/me/password', headers=headers, json={'currentPassword':credentials['password'],'newPassword':replacement})
    assert response.status_code == 200, response.text
    assert client.post('/auth/login',json={'email':credentials['email'],'password':replacement}).status_code == 200
    assert client.post('/auth/login',json={'email':credentials['email'],'password':replacement.strip()}).status_code == 401


def test_firebase_cleanup_is_scoped_batched_and_retry_safe(monkeypatch):
    from types import SimpleNamespace
    target='deleted-user'
    documents={
        'conversations':[(target,str(i)) for i in range(3)]+[('other','keep-conversation')],
        'messages':[(target,str(i)) for i in range(850)]+[('other','keep-message')],
    }
    commits=[]
    class Query:
        def __init__(self,name): self.name=name
        def where(self,*,filter):
            assert filter.field_path=='participants' and filter.op_string=='array_contains' and filter.value==target
            return self
        def limit(self,limit): self.size=limit;return self
        def stream(self):
            return [SimpleNamespace(reference=(self.name,entry)) for entry in documents[self.name] if entry[0]==target][:self.size]
    class Batch:
        def __init__(self):self.deleted=[]
        def delete(self,reference):self.deleted.append(reference)
        def commit(self):
            commits.append(self.deleted)
            for name,entry in self.deleted: documents[name].remove(entry)
    fake=SimpleNamespace(collection=Query,batch=Batch)
    monkeypatch.setattr(chat,'settings',lambda:SimpleNamespace(firebase_project_id='test-project'))
    monkeypatch.setattr(chat,'firebase_app',lambda:'test-app')
    monkeypatch.setattr(chat.firestore,'client',lambda **kwargs:fake)
    identities=[]
    monkeypatch.setattr(chat.auth,'delete_user',lambda uid,**kwargs:identities.append(uid))
    chat.delete_account_data(target)
    assert identities==[target]
    assert documents=={'conversations':[('other','keep-conversation')],'messages':[('other','keep-message')]}
    assert [len(batch) for batch in commits]==[3,400,400,50]
    def already_deleted(*args,**kwargs):
        raise chat.auth.UserNotFoundError('Already removed')
    monkeypatch.setattr(chat.auth,'delete_user',already_deleted)
    chat.delete_account_data(target)
    assert len(commits)==4
