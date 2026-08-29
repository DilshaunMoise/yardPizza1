#!/bin/zsh
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
clear
echo "========================================"
echo " Pizza Yard - Edge Function Deployment"
echo "========================================"
echo ""
if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI was not found."
  echo "Install/update the Supabase CLI, then run this file again."
  echo ""
  read -k 1 "?Press any key to close..."
  exit 1
fi
echo "CLI: $(supabase --version)"
echo "Project: dsjskpqdofuhkzkylxqt"
echo "Folder: $SCRIPT_DIR"
echo ""
echo "Deploying..."
echo ""
supabase functions deploy pizza-yard-staff-api --project-ref dsjskpqdofuhkzkylxqt --no-verify-jwt --use-api --debug
code=$?
echo ""
if [ $code -eq 0 ]; then
  echo "SUCCESS: pizza-yard-staff-api was deployed."
else
  echo "DEPLOYMENT FAILED (exit code $code)."
  echo "Read the error above and send it to ChatGPT if needed."
fi
echo ""
read -k 1 "?Press any key to close..."
exit $code
