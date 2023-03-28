#!/bin/bash

MYSQL_PASSWORD=`pwgen 12 -1`

# Setup MySQL user for Mailtrain
mysql -u root -p -e "CREATE USER 'ivis'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON ivis.* TO 'ivis'@'localhost';"
mysql -u ivis --password="$MYSQL_PASSWORD" -e "CREATE database ivis;"

cat > config/development.yaml <<EOT
mysql:
  password: $MYSQL_PASSWORD

www:
  trustedPortIsHttps: false
  sandboxPortIsHttps: false
  apiPortIsHttps: false

  trustedUrlBase: http://localhost:8443
  sandboxUrlBase: http://localhost:8445
EOT
