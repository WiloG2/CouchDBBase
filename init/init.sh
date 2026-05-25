#!/bin/sh

echo "Esperando CouchDB..."
sleep 10

BASE_URL="http://admin:admin123@couchdb:5984"

echo "Creando bases..."
curl -X PUT $BASE_URL/users_db
curl -X PUT $BASE_URL/products_db
curl -X PUT $BASE_URL/orders_db
curl -X PUT $BASE_URL/media_db

echo "Insertando usuarios..."
curl -X POST $BASE_URL/users_db/_bulk_docs \
-H "Content-Type: application/json" \
-d '{
  "docs": [
    {
      "_id": "user:admin",
      "username": "admin",
      "password": "admin123",
      "role": "admin",
      "email": "admin@fake.com",
      "creditCard": "4111111111111111"
    },
    {
      "_id": "user:juan",
      "username": "juan",
      "password": "123456",
      "role": "user",
      "email": "juan@test.com"
    },
    {
      "_id": "user:maria",
      "username": "maria",
      "password": "maria2026",
      "role": "user",
      "email": "maria@test.com"
    },
    {
      "_id": "user:analyst",
      "username": "analyst",
      "password": "labpass",
      "role": "analyst",
      "email": "analyst@fake.com"
    }
  ]
}'

echo "Insertando productos..."
curl -X POST $BASE_URL/products_db/_bulk_docs \
-H "Content-Type: application/json" \
-d '{
  "docs": [
    { "_id": "product:1", "name": "Laptop Gamer", "category": "computers", "price": 1500, "stock": 5, "featured": true },
    { "_id": "product:2", "name": "Smartphone Pro", "category": "phones", "price": 900, "stock": 15, "featured": true },
    { "_id": "product:3", "name": "Audifonos Bluetooth", "category": "audio", "price": 120, "stock": 40, "featured": false },
    { "_id": "product:4", "name": "Teclado Mecanico", "category": "accessories", "price": 85, "stock": 25, "featured": false },
    { "_id": "product:5", "name": "Mouse Ergonomico", "category": "accessories", "price": 45, "stock": 70, "featured": false },
    { "_id": "product:6", "name": "Monitor 27 Pro", "category": "computers", "price": 310, "stock": 18, "featured": true },
    { "_id": "product:7", "name": "Camara Web HD", "category": "accessories", "price": 65, "stock": 34, "featured": false },
    { "_id": "product:8", "name": "Router Empresarial", "category": "networking", "price": 220, "stock": 9, "featured": true },
    { "_id": "product:9", "name": "Disco SSD 1TB", "category": "storage", "price": 140, "stock": 31, "featured": false },
    { "_id": "product:10", "name": "Tablet Educativa", "category": "tablets", "price": 260, "stock": 22, "featured": false },
    { "_id": "product:11", "name": "Servidor Mini Lab", "category": "computers", "price": 780, "stock": 4, "featured": true },
    { "_id": "product:12", "name": "Impresora Laser", "category": "office", "price": 190, "stock": 12, "featured": false }
  ]
}'

echo "Insertando ordenes..."
curl -X POST $BASE_URL/orders_db/_bulk_docs \
-H "Content-Type: application/json" \
-d '{
  "docs": [
    { "_id": "order:1", "username": "juan", "status": "paid", "total": 1620, "items": ["product:1", "product:3"], "shippingCity": "Quito", "paymentLast4": "1111" },
    { "_id": "order:2", "username": "maria", "status": "pending", "total": 900, "items": ["product:2"], "shippingCity": "Guayaquil", "paymentLast4": "4242" },
    { "_id": "order:3", "username": "juan", "status": "cancelled", "total": 85, "items": ["product:4"], "shippingCity": "Cuenca", "paymentLast4": "1881" },
    { "_id": "order:4", "username": "analyst", "status": "paid", "total": 1000, "items": ["product:8", "product:10"], "shippingCity": "Manta", "paymentLast4": "9090" }
  ]
}'

echo "Insertando medios..."
curl -X POST $BASE_URL/media_db/_bulk_docs \
-H "Content-Type: application/json" \
-d '{
  "docs": [
    { "_id": "media:1", "owner": "juan", "filename": "invoice-juan.pdf", "visibility": "private", "mime": "application/pdf" },
    { "_id": "media:2", "owner": "maria", "filename": "profile-maria.png", "visibility": "public", "mime": "image/png" },
    { "_id": "media:3", "owner": "admin", "filename": "backup-users.json", "visibility": "restricted", "mime": "application/json" }
  ]
}'

echo "Inicialización completa"
