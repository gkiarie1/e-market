def profile_json(user):
    return {'id': user.id, 'name': user.name, 'role': user.role, 'phone': user.phone, 'alternate': user.alternate, 'area': user.area, 'produce': user.produce, 'email': user.email,
            **({'latitude': user.latitude, 'longitude': user.longitude} if user.latitude is not None else {})}

