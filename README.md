# Pizza Yard — Final Improved Build

This build keeps the working Supabase customer-order flow and adds:

- 12-inch pizzas only
- Explicit Cheese Pizza option
- Existing 8 toppings
- Live order summary and pricing
- Pickup/delivery validation
- Supabase order saving
- Formspree backup notification
- Staff dashboard search
- Staff sales statistic
- Staff status workflow: New → Preparing → In Oven → Ready → Completed
- Staff print-order button
- Customer live order progress tracker
- Secure customer tracking token + Supabase RPC
- Mobile-friendly progress tracker

## Important deployment order

1. Upload these files to the same GitHub Pages repository:
   - index.html
   - script.js
   - style.css
   - dashboard.html
   - dashboard.js
   - dashboard.css
   - supabase-setup.sql
2. In the existing Supabase project, run `supabase-setup.sql` once.
3. Do not create a new Supabase project.
4. Do not put a Supabase secret/service-role key in the website.
5. Place one test order.
6. Confirm it appears in Supabase.
7. Sign into `/dashboard.html` and change its status to test the workflow.
8. The customer confirmation tracker polls the secure status function and updates as staff changes status.

The current pizza entry price is preserved at $20; Cheese Pizza uses that same existing entry price so no new price was invented.
