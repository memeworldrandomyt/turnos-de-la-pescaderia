# Turnos de la Pescadería - Apache + TXT

Versión 100% local:

- Apache sirve la web.
- PHP escribe y lee la base de datos local.
- La base de datos es `data/turnos_db.txt`.
- No usa Google, Node, MySQL ni APIs externas.

## Estructura obligatoria

```text
index.html
main.js
styles.css
api/
  turnos.php
data/
  turnos_db.txt
```

## Instalar en Debian

```bash
sudo apt update
sudo apt install apache2 php libapache2-mod-php git unzip -y
sudo systemctl restart apache2
```

## Instalar desde GitHub en Apache

```bash
sudo rm -rf /var/www/html/*
cd /var/www/html
sudo git clone https://github.com/memeworldrandomyt/turnos-de-la-pescaderia.git .
sudo chown -R www-data:www-data /var/www/html/data
sudo chmod -R 775 /var/www/html/data
sudo systemctl restart apache2
```

## Probar PHP/API

```bash
curl http://localhost/api/turnos.php
curl -X POST http://localhost/api/turnos.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"requestTurn","groupNumber":"3"}'
cat /var/www/html/data/turnos_db.txt
```

## Windows con VirtualBox NAT

Usa esta regla:

```text
Host 8080 -> Guest 80
```

Luego abre:

```text
http://localhost:8080
```
