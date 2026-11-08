#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${MYSQL_BACKUP_DATABASE:?Defina o nome exato do banco MySQL do cPanel.}"
: "${MYSQL_BACKUP_CNF:?Defina o caminho do arquivo privado de credenciais MySQL.}"
: "${MYSQL_BACKUP_DIR:?Defina uma pasta de backup fora de public_html.}"

retention_days="${MYSQL_BACKUP_RETENTION_DAYS:-30}"
gzip_bin="${GZIP_BIN:-gzip}"

if [[ -n "${MYSQLDUMP_BIN:-}" ]]; then
  mysqldump_bin="$MYSQLDUMP_BIN"
elif command -v mysqldump >/dev/null 2>&1; then
  mysqldump_bin="mysqldump"
elif command -v mariadb-dump >/dev/null 2>&1; then
  mysqldump_bin="mariadb-dump"
else
  echo "mysqldump/mariadb-dump não foi encontrado. Defina MYSQLDUMP_BIN com o caminho completo." >&2
  exit 127
fi

if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "MYSQL_BACKUP_RETENTION_DAYS deve ser um inteiro positivo." >&2
  exit 2
fi

if [[ ! -r "$MYSQL_BACKUP_CNF" ]]; then
  echo "Arquivo de credenciais não encontrado ou sem permissão de leitura: $MYSQL_BACKUP_CNF" >&2
  exit 2
fi
chmod 600 -- "$MYSQL_BACKUP_CNF"

if ! command -v "$mysqldump_bin" >/dev/null 2>&1; then
  echo "O executável de dump não foi encontrado: $mysqldump_bin" >&2
  exit 127
fi

if ! command -v "$gzip_bin" >/dev/null 2>&1; then
  echo "gzip não foi encontrado. Defina GZIP_BIN com o caminho completo." >&2
  exit 127
fi

safe_database="${MYSQL_BACKUP_DATABASE//[^[:alnum:]_.-]/_}"
timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
mkdir -p -- "$MYSQL_BACKUP_DIR"
chmod 700 -- "$MYSQL_BACKUP_DIR"

temporary_file="$(mktemp "$MYSQL_BACKUP_DIR/.${safe_database}.XXXXXX")"
cleanup() {
  rm -f -- "$temporary_file"
}
trap cleanup EXIT

"$mysqldump_bin" \
  --defaults-extra-file="$MYSQL_BACKUP_CNF" \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --triggers \
  --hex-blob \
  --no-tablespaces \
  -- "$MYSQL_BACKUP_DATABASE" | "$gzip_bin" -c > "$temporary_file"

"$gzip_bin" -t "$temporary_file"

backup_file="$MYSQL_BACKUP_DIR/${safe_database}-${timestamp}-$$.sql.gz"
mv -- "$temporary_file" "$backup_file"
trap - EXIT

find "$MYSQL_BACKUP_DIR" \
  -maxdepth 1 \
  -type f \
  -name "${safe_database}-*.sql.gz" \
  -mtime "+$retention_days" \
  -delete

echo "Backup criado: $backup_file"
