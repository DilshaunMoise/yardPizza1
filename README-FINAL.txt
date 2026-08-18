Pizza Yard — New Supabase Project Build

This build points the browser application to the new Supabase project:
https://pqzfmbqmkeythyajkiti.supabase.co

The browser uses only the Supabase publishable key and normal RLS/Auth.
No service-role or secret key is included.

IMPORTANT:
The new Supabase project is a fresh backend. Existing production data from the old project is not automatically copied by this ZIP.
Do not delete the old project until the new project has been tested and any required data migration is complete.

Main files:
- index.html
- dashboard.html
- dashboard.js
- dashboard.css
- breakfast.html / breakfast.js / breakfast.css
- staff.html / staff.js / staff.css
- inventory.html / inventory.js / inventory.css
- style.css / script.js
- breakfast-banner.css
- supabase-setup.sql

FINAL EDGE FUNCTION FIX
-----------------------
This replacement package includes the actual function source at:
  supabase/functions/pizza-yard-staff-api/index.ts

Deploy it with:
  supabase functions deploy pizza-yard-staff-api --project-ref dsjskpqdofuhkzkylxqt --no-verify-jwt

Do not put a secret key into any browser file.
