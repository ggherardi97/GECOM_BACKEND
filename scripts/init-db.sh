#!/bin/sh
set -e

echo "🔍 Debug -> DB_HOST=$DB_HOST | DB_PORT=$DB_PORT | DB_USER=$DB_USER | DB_NAME=$DB_NAME"

export PGPASSWORD=$DB_PASS

echo "⏳ Aguardando o banco de dados ficar disponível em $DB_HOST:$DB_PORT..."

for i in $(seq 1 60); do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    echo "✅ Banco de dados disponível!"
    break
  fi
  echo "⏳ Tentativa $i de 60..."
  sleep 2
done

if [ $i -eq 60 ]; then
  echo "❌ Banco de dados não respondeu após 120 segundos. Abortando."
  exit 1
fi

# Cria o banco se ainda não existir
if ! psql -h "$DB_HOST" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "🆕 Criando banco de dados '$DB_NAME'..."
  createdb -h "$DB_HOST" -U "$DB_USER" "$DB_NAME"
else
  echo "✅ Banco de dados '$DB_NAME' já existe."
fi

echo "🚀 Executando migrations..."
npm run migration:up || true

echo "✅ Banco pronto para uso!"

echo "🚀 Iniciando a aplicação Gecom Api..."

npm run prisma:update

npm run dev
