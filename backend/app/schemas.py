from typing import Literal
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class Coordinates(Input):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class LocationUpdate(Coordinates):
    area: str = Field(min_length=1, max_length=100)
    consent: Literal[True]


class Register(Input):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    role: Literal['buyer', 'farmer']
    phone: str = Field(min_length=7, max_length=30)
    alternate: str = Field(default='', max_length=30)
    area: str = Field(min_length=1, max_length=100)
    produce: str = Field(default='', max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    locationConsent: bool = False

    @model_validator(mode='after')
    def validate_location(self):
        if self.role == 'farmer' and (not self.alternate or not self.produce or self.latitude is None or self.longitude is None or not self.locationConsent):
            raise ValueError('Farmers must supply both contacts, produce, and consent to store farm location.')
        if self.role == 'buyer' and (self.latitude is not None or self.longitude is not None):
            raise ValueError('Buyer search coordinates are temporary and must not be stored in a profile.')
        return self


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ListingInput(Input):
    name: str = Field(min_length=1, max_length=120)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    quantity: int = Field(ge=1, le=1_000_000, strict=True)
    unit: str = Field(min_length=1, max_length=30)
    bulk: bool = False
    minimum: int = Field(default=1, ge=1, strict=True)
    image: str = Field(min_length=1, max_length=255)

    @model_validator(mode='after')
    def validate_minimum(self):
        if self.minimum > self.quantity or (not self.bulk and self.minimum != 1):
            raise ValueError('Minimum must fit available stock; retail minimum is 1.')
        return self


class CartItem(Input):
    listingId: str = Field(min_length=1, max_length=36)
    quantity: int = Field(ge=1, le=1_000_000, strict=True)


class Checkout(Input):
    requestKey: str = Field(min_length=8, max_length=100)
    items: list[CartItem] = Field(min_length=1, max_length=50)
    payment: Literal['Cash on collection', 'Cash on delivery', 'Bank transfer arranged with seller']

    @model_validator(mode='after')
    def distinct_items(self):
        if len({item.listingId for item in self.items}) != len(self.items):
            raise ValueError('Duplicate listing IDs are not allowed.')
        return self


class ReviewInput(Input):
    farmerId: str = Field(min_length=1, max_length=36)
    rating: int = Field(ge=1, le=5, strict=True)
    text: str = Field(min_length=1, max_length=2000)


class ConversationInput(Input):
    recipientId: str = Field(min_length=1, max_length=36)


class StatusInput(Input):
    status: Literal['Confirmed', 'Completed', 'Cancelled']
