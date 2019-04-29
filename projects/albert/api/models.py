# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models

# Create your models here.

class Book(models.Model):
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    cover = models.IntegerField()
    isbn = models.IntegerField(primary_key=True)

def __str(self):
    return '%s %s' % (self.title, self.author)


class User(models.Model): 
    name = models.CharField(max_length=255)
    user_id = models.AutoField(primary_key=True)

def __str(self): 
    return self

class Wishlist(models.Model): 
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    book = models.ForeignKey(Book, on_delete=models.CASCADE)

def __str(self): 
    return self