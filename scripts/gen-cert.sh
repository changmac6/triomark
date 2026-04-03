#!/usr/bin/env bash
set -euo pipefail

mkdir -p certs

cat > certs/openssl-triomark.cnf <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = 192.168.0.150

[v3_req]
subjectAltName = @alt_names

[alt_names]
IP.1 = 192.168.0.150
DNS.1 = localhost
IP.2 = 127.0.0.1
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 3650 \
  -config certs/openssl-triomark.cnf

echo "Generated certs/server.crt and certs/server.key for 192.168.0.150"