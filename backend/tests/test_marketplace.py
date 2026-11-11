from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import uuid4
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app


def account(client, role='buyer', **overrides):
    data = {'email':f'{uuid4()}@example.com','password':'StrongPassword123!','name':f'Test {role}', 'role':role,'phone':'0712345678','area':'Kiambu'}
    if role == 'farmer':
        data.update(alternate='0798765432',produce='Tomatoes',latitude=-1.17,longitude=36.83,locationConsent=True)
    data.update(overrides)
    response=client.post('/auth/register',json=data)
    assert response.status_code == 201, response.text
    result=response.json()
    return {'Authorization':'Bearer '+result['token']}, result['profile'], data


def listing(client, farmer, quantity=10, price=80, bulk=False):
    buffer=BytesIO()
    Image.new('RGB',(30,30),'red').save(buffer,format='JPEG')
    image=client.post('/photos',headers=farmer,files={'file':('produce.jpg',buffer.getvalue(),'image/jpeg')})
    assert image.status_code==201,image.text
    response=client.post('/listings',headers=farmer,json={'name':'Fresh tomatoes','price':price,'quantity':quantity,'unit':'kg','image':image.json()['path'],'bulk':bulk,'minimum':5 if bulk else 1})
    assert response.status_code==201,response.text
    return response.json()


def checkout(client, buyer, items, key=None):
    return client.post('/orders',headers=buyer,json={'items':items,'payment':'Cash on collection','requestKey':key or str(uuid4())})


def test_authentication_privacy_and_logout(client):
    headers,profile,data=account(client)
    assert client.get('/me').status_code==401
    assert client.get('/me',headers=headers).json()['id']==profile['id']
    assert 'password' not in client.get('/me',headers=headers).text
    assert client.post('/auth/login',json={'email':data['email'],'password':'wrong'}).status_code==401
    assert client.post('/auth/login',json={'email':data['email'],'password':data['password']}).status_code==200
    assert client.post('/auth/register',json=data).status_code==409
    assert client.post('/auth/logout',headers=headers).status_code==204
    assert client.get('/me',headers=headers).status_code==401


def test_registration_requires_farm_location_and_consent(client):
    data={'email':'farm@example.com','password':'StrongPassword123!','name':'Farm','role':'farmer','phone':'0712345678','alternate':'0798765432','area':'Kiambu','produce':'Tomatoes','latitude':-1,'longitude':36}
    assert client.post('/auth/register',json=data).status_code==422
    data['locationConsent']=True
    data['latitude']=91
    assert client.post('/auth/register',json=data).status_code==422
    data.update(role='buyer',latitude=0,longitude=0)
    assert client.post('/auth/register',json=data).status_code==422


def test_nearby_filter_and_private_coordinates(client):
    near,near_profile,_=account(client,'farmer')
    far,_,_=account(client,'farmer',latitude=-4.04,longitude=39.67,area='Mombasa')
    near_listing=listing(client,near)
    listing(client,far)
    buyer,_,_=account(client)
    assert 'latitude' not in near_listing and 'longitude' not in near_listing
    result=client.get('/listings?latitude=-1.17&longitude=36.83&radiusKm=30',headers=buyer)
    assert result.status_code==200,result.text
    assert [l['id'] for l in result.json()]==[near_listing['id']]
    assert result.json()[0]['distanceKm']<=1
    assert len(client.get('/listings?area=kiambu',headers=buyer).json())==1
    assert len(client.get('/listings',headers=buyer).json())==2
    assert client.get('/listings?latitude=1',headers=buyer).status_code==422
    assert client.get('/listings?latitude=NaN&longitude=36',headers=buyer).status_code==422
    updated=client.patch('/me/location',headers=near,json={'latitude':0,'longitude':0,'area':'New farm','consent':True})
    assert updated.status_code==200,updated.text
    assert client.get('/listings?latitude=0&longitude=0&radiusKm=1',headers=buyer).json()[0]['id']==near_listing['id']
    assert client.patch('/me/location',headers=buyer,json={'latitude':0,'longitude':0,'area':'x','consent':True}).status_code==403
    assert client.delete('/me/location',headers=near).status_code==204
    assert client.get('/listings?latitude=0&longitude=0&radiusKm=1',headers=buyer).json()==[]


def test_server_prices_stock_idempotency_and_cancellation(client):
    farmer,_,_=account(client,'farmer')
    buyer,_,_=account(client)
    stranger,_,_=account(client)
    item=listing(client,farmer,quantity=10,price=80)
    key=str(uuid4())
    payload=[{'listingId':item['id'],'quantity':3}]
    response=checkout(client,buyer,payload,key)
    assert response.status_code==201,response.text
    order=response.json()[0]
    assert order['total']==240
    retry=checkout(client,buyer,payload,key)
    assert retry.json()[0]['id']==order['id']
    assert client.get('/listings',headers=buyer).json()[0]['quantity']==7
    assert checkout(client,buyer,[{'listingId':item['id'],'quantity':4}],key).status_code==409
    assert checkout(client,buyer,[{'listingId':item['id'],'quantity':8}]).status_code==409
    assert client.patch('/orders/'+order['id'],headers=stranger,json={'status':'Cancelled'}).status_code==404
    assert client.patch('/orders/'+order['id'],headers=buyer,json={'status':'Completed'}).status_code==409
    assert client.patch('/orders/'+order['id'],headers=buyer,json={'status':'Confirmed'}).status_code==403
    assert client.patch('/orders/'+order['id'],headers=farmer,json={'status':'Confirmed'}).status_code==200
    assert client.patch('/orders/'+order['id'],headers=buyer,json={'status':'Cancelled'}).status_code==200
    assert client.get('/listings',headers=buyer).json()[0]['quantity']==10
    assert client.patch('/orders/'+order['id'],headers=buyer,json={'status':'Cancelled'}).status_code==409
    assert client.get('/orders',headers=stranger).json()==[]


def test_splits_sellers_and_completed_analytics(client):
    farmer1,p1,_=account(client,'farmer')
    farmer2,p2,_=account(client,'farmer')
    buyer,_,_=account(client)
    first=listing(client,farmer1)
    second=listing(client,farmer2,price=100)
    response=checkout(client,buyer,[{'listingId':first['id'],'quantity':2},{'listingId':second['id'],'quantity':1}])
    assert response.status_code==201,response.text
    assert len(response.json())==2
    own=client.get('/orders',headers=farmer1).json()
    assert len(own)==1 and own[0]['total']==160 and len(own[0]['items'])==1
    oid=own[0]['id']
    assert client.patch('/orders/'+oid,headers=farmer1,json={'status':'Confirmed'}).status_code==200
    assert client.patch('/orders/'+oid,headers=farmer1,json={'status':'Completed'}).status_code==200
    assert client.get('/analytics',headers=farmer1).json()['Completed']['value']==160
    assert client.get('/analytics',headers=buyer).status_code==403
    assert client.get('/listings?sort=popular',headers=buyer).json()[0]['farmerId']==p1['id']


def test_concurrent_checkouts_cannot_oversell(client):
    farmer,_,_=account(client,'farmer')
    buyer1,_,_=account(client)
    buyer2,_,_=account(client)
    item=listing(client,farmer,quantity=1)
    def purchase(headers):
        with TestClient(app) as other:
            return checkout(other,headers,[{'listingId':item['id'],'quantity':1}]).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(purchase,[buyer1,buyer2]))
    assert sorted(results)==[201,409]
    assert client.get('/listings?mine=true',headers=farmer).json()[0]['quantity']==0


def test_concurrent_retry_reserves_once(client):
    farmer,_,_=account(client,'farmer')
    buyer,_,_=account(client)
    item=listing(client,farmer,quantity=10)
    key=str(uuid4())
    def purchase(_):
        with TestClient(app) as other:
            return checkout(other,buyer,[{'listingId':item['id'],'quantity':2}],key).json()[0]['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids=list(pool.map(purchase,range(2)))
    assert ids[0]==ids[1]
    assert client.get('/listings',headers=buyer).json()[0]['quantity']==8


def test_upload_ownership_reviews_and_chat_auth(client,monkeypatch):
    farmer,p,_=account(client,'farmer')
    other,_,_=account(client,'farmer')
    buyer,b,_=account(client)
    assert client.post('/photos',headers=farmer,files={'file':('bad.jpg',b'not an image','image/jpeg')}).status_code==422
    assert client.post('/photos',headers=buyer,files={'file':('bad.jpg',b'bad','image/jpeg')}).status_code==403
    item=listing(client,farmer)
    path=item['image'].split('http://localhost:8000')[-1]
    assert client.post('/listings',headers=other,json={'name':'Stolen photo','price':1,'quantity':10,'unit':'kg','image':path}).status_code==422
    assert client.post('/reviews',headers=buyer,json={'farmerId':p['id'],'rating':6,'text':'Invalid'}).status_code==422
    for stars in [5,3]:
        assert client.post('/reviews',headers=buyer,json={'farmerId':p['id'],'rating':stars,'text':'Fresh'}).status_code==200
    assert len(client.get('/reviews',headers=buyer).json())==1
    assert client.get('/listings',headers=buyer).json()[0]['rating']==3
    assert client.post('/chat/token').status_code==401
    assert client.post('/chat/token',headers=buyer).status_code==503
    called={}
    def token(user_id,expires):
        called['id']=user_id
        return 'custom-token'
    monkeypatch.setattr('app.chat.custom_token',token)
    assert client.post('/chat/token',headers=buyer).json()['token']=='custom-token'
    assert called['id']==b['id']
    assert client.post('/chat/conversations',headers=buyer,json={'recipientId':b['id']}).status_code==404
    assert client.post('/chat/conversations',headers=farmer,json={'recipientId':p['id']}).status_code==404


def test_checkout_rejects_duplicates_and_tampered_totals(client):
    farmer,_,_=account(client,'farmer')
    buyer,_,_=account(client)
    item=listing(client,farmer,bulk=True)
    assert checkout(client,buyer,[{'listingId':item['id'],'quantity':1}]).status_code==409
    assert checkout(client,buyer,[{'listingId':item['id'],'quantity':5},{'listingId':item['id'],'quantity':5}]).status_code==422
    response=client.post('/orders',headers=buyer,json={'requestKey':str(uuid4()),'items':[{'listingId':item['id'],'quantity':5}],'payment':'Cash on collection','total':1})
    assert response.status_code==422


def test_large_order_totals_are_not_truncated(client):
    farmer,_,_=account(client,'farmer')
    buyer,_,_=account(client)
    item=listing(client,farmer,quantity=1_000_000,price=9999999999.99)
    response=checkout(client,buyer,[{'listingId':item['id'],'quantity':1_000_000}])
    assert response.status_code==201,response.text
    assert response.json()[0]['total']>1_000_000_000_000


def test_photo_reencoding_removes_exif(client):
    farmer,_,_=account(client,'farmer')
    photo=Image.new('RGB',(10,20),'green')
    exif=Image.Exif()
    exif[0x010E]='private metadata'
    exif[0x0112]=6
    buffer=BytesIO()
    photo.save(buffer,format='JPEG',exif=exif)
    response=client.post('/photos',headers=farmer,files={'file':('produce.jpg',buffer.getvalue(),'image/jpeg')})
    assert response.status_code==201,response.text
    output=client.get(response.json()['path'])
    result=Image.open(BytesIO(output.content))
    assert not result.getexif()
    assert result.size==(20,10)


def test_wholesale_notifications_and_read_privacy(client):
    farmer, fp, _ = account(client, 'farmer')
    buyer, bp, _ = account(client)
    stranger, _, _ = account(client)
    original = listing(client, farmer, quantity=100, price=120)
    from app.db import SessionLocal
    from app.models import Listing
    with SessionLocal() as db:
        image = db.get(Listing, original['id']).image
    payload = {'name':'Wholesale avocados','price':120,'quantity':100,'unit':'kg','image':image,'wholesale_price':85,'wholesale_minimum':10}
    published = client.post('/listings', headers=farmer, json=payload)
    assert published.status_code == 201, published.text
    item = published.json()
    assert item['wholesalePrice'] == 85 and item['wholesaleMinimum'] == 10 and not item['wholesaleOnly']
    retail = checkout(client,buyer,[{'listingId':item['id'],'quantity':9}]).json()[0]
    assert retail['total'] == 1080 and retail['items'][0]['unitPrice'] == 120
    key = str(uuid4())
    bulk = checkout(client,buyer,[{'listingId':item['id'],'quantity':10}],key).json()[0]
    assert bulk['total'] == 850 and bulk['items'][0]['listing']['price'] == 85
    assert bulk['items'][0]['unitPrice'] == 85
    assert len(client.get('/notifications',headers=farmer).json()) == 2
    checkout(client,buyer,[{'listingId':item['id'],'quantity':10}],key)
    assert len(client.get('/notifications',headers=farmer).json()) == 2
    notification = client.get('/notifications',headers=farmer).json()[0]
    assert not notification['read']
    assert client.get('/notifications',headers=stranger).json() == []
    assert client.patch('/notifications/'+notification['id']+'/read',headers=stranger).status_code == 404
    assert client.patch('/notifications/'+notification['id']+'/read',headers=farmer).status_code == 204
    assert client.get('/notifications',headers=farmer).json()[0]['read']
    assert client.patch('/orders/'+bulk['id'],headers=farmer,json={'status':'Confirmed'}).status_code == 200
    assert client.get('/notifications',headers=buyer).json()[0]['title'] == 'Order confirmed'
    payload.update(bulk=True,price=85,minimum=10)
    only = client.post('/listings',headers=farmer,json=payload)
    assert only.status_code == 201, only.text
    assert only.json()['wholesaleOnly']
    assert checkout(client,buyer,[{'listingId':only.json()['id'],'quantity':9}]).status_code == 409
    assert checkout(client,buyer,[{'listingId':only.json()['id'],'quantity':10}]).json()[0]['total'] == 850
    payload['wholesale_minimum'] = 101
    assert client.post('/listings',headers=farmer,json=payload).status_code == 422
    from datetime import datetime, timezone, timedelta
    date = datetime.now(timezone.utc)
    path = '/chat/reads/' + fp['id']
    assert client.patch(path,headers=buyer,json={'date':date.isoformat()}).status_code == 204
    assert client.patch(path,headers=buyer,json={'date':(date-timedelta(hours=1)).isoformat()}).status_code == 204
    assert client.get('/chat/reads',headers=stranger).json() == {}
    assert datetime.fromisoformat(client.get('/chat/reads',headers=buyer).json()[fp['id']]) == date
    assert client.patch(path,headers=buyer,json={'date':(date+timedelta(days=1)).isoformat()}).status_code == 422
    assert client.patch('/chat/reads/'+bp['id'],headers=buyer,json={'date':date.isoformat()}).status_code == 404
