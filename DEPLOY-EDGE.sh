#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"
echo "Pizza Yard Edge Function deployment"
echo "Project: dsjskpqdofuhkzkylxqt"
echo "Folder: $SCRIPT_DIR"
if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: Supabase CLI is not installed or is not on PATH."
  echo "Install/update it, then run this script again."
  exit 1
fi
echo "Supabase CLI: $(supabase --version)"
echo "Deploying pizza-yard-staff-api..."
supabase functions deploy pizza-yard-staff-api --project-ref dsjskpqdofuhkzkylxqt --no-verify-jwt --use-api --debug
echo ""
echo "DEPLOYMENT FINISHED. Check Supabase > Edge Functions > pizza-yard-staff-api."
