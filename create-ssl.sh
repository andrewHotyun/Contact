#!/bin/bash

echo "🔐 Створення SSL сертифіката для Contact App..."
echo "IP: 192.168.50.125"
echo ""

# Перевірка чи встановлений OpenSSL
if ! command -v openssl &> /dev/null; then
    echo "❌ OpenSSL не встановлений. Будь ласка, встановіть OpenSSL"
    exit 1
fi

echo "✅ OpenSSL знайдено"

# Видалення старих сертифікатів
if [ -f "cert.pem" ]; then
    rm cert.pem
    echo "🗑️  Старий сертифікат видалено"
fi

if [ -f "key.pem" ]; then
    rm key.pem
    echo "🗑️  Старий ключ видалено"
fi

# Створення конфігураційного файлу для OpenSSL
cat > ssl.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = UA
ST = Ukraine
L = Kyiv
O = ContactApp
OU = IT Department
CN = 192.168.50.125

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1 = 192.168.50.125
IP.2 = 127.0.0.1
DNS.1 = localhost
DNS.2 = 192.168.50.125
EOF

echo "✅ Конфігураційний файл створено"

# Створення приватного ключа
echo "🔑 Створення приватного ключа..."
openssl genrsa -out key.pem 4096

# Створення сертифіката
echo "📜 Створення сертифіката..."
openssl req -new -x509 -key key.pem -out cert.pem -days 365 -config ssl.conf -extensions v3_req

# Перевірка сертифіката
echo "🔍 Перевірка сертифіката..."
openssl x509 -in cert.pem -text -noout | grep -A 5 "Subject Alternative Name"

# Видалення тимчасового файлу
rm ssl.conf

echo ""
echo "✅ SSL сертифікат успішно створено!"
echo "📁 Файли:"
echo "   - cert.pem (сертифікат)"
echo "   - key.pem (приватний ключ)"
echo ""
echo "🌐 Тепер запустіть: ./start-https.sh"


