from tastypie.resources import ModelResource
from api.models import Book

class BookResource(ModelResource):
    class Meta:
        queryset = Book.objects.all()
        resource_name = 'book'