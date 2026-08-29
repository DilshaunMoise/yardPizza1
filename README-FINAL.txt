PIZZA YARD — FINAL COMPLETE SUPABASE BUILD

Source of truth
---------------
This package is based on Pizza-Yard-SUPABASE-EDGE-FIXED-FINAL5-20260818(1).zip and keeps the existing customer site, live dashboard, staff ordering, inventory, rewards, breakfast, reviews, notifications, half-and-half pizza builder, multi-pizza cart, Formspree backup and Supabase Edge Function architecture.

What is included
----------------
Customer site:
- 12-inch pizza builder with whole / half-and-half toppings
- Veg topping
- Multiple pizza cart
- Pickup / delivery rules
- Optional customer name, phone and email; missing name is saved as Walk-in Customer
- Cocoa Tea and Local Juice add-ons
- Customer favorites and Order Again
- Popular items, combos, daily specials and secret-menu messaging
- Browser order-status notifications
- Back-in-stock requests for sold-out toppings
- Birthday rewards, milestones and streak messaging

Staff / kitchen:
- Staff authentication
- Fast tablet / store mode
- Pizza + breakfast + drinks
- Multiple pizza selections
- Payment status
- Live dashboard
- Breakfast orders on the dashboard
- Loud sound + voice announcements
- Kitchen mode and order timers
- Realtime/polling reconnection behavior
- Topping availability
- Review approval
- Reward-code verification

Inventory / business:
- Inventory quantities, weights, minimums, suppliers and history
- Drinks category
- Cocoa Tea / Local Juice stock
- Editable drink prices and availability
- Back-in-stock customer request queue
- Business Earnings page
- Today / week / month / last month / all-time completed sales
- Pizza / breakfast / drink revenue breakdown
- Pickup / delivery and online / staff channel breakdown
- 12-month sales history chart

Supabase setup
--------------
1. Run the COMPLETE supabase-setup.sql in the Supabase SQL Editor.
2. Deploy the included Edge Function:
   supabase functions deploy pizza-yard-staff-api --project-ref dsjskpqdofuhkzkylxqt --no-verify-jwt
3. Confirm your staff Auth user has a matching row in public.staff_users.
4. Publish all website files together. Do not publish only selected files.

Project
-------
Supabase project ref: dsjskpqdofuhkzkylxqt
Browser URL: https://dsjskpqdofuhkzkylxqt.supabase.co
Edge Function:
https://dsjskpqdofuhkzkylxqt.supabase.co/functions/v1/pizza-yard-staff-api

Security
--------
Only the browser-safe publishable key is included. Never add a service-role or sb_secret key to any website file.

Important
---------
Completed sales are used for business earnings. Cancelled orders are excluded.
Rewards are awarded by the database completion trigger, so staff status changes remain the source of truth.

FINAL VALIDATION NOTE
---------------------
This package includes a corrected Business Earnings calculation for drink revenue.
Drink revenue is derived from the saved order_details drink quantities/prices instead of an undefined variable.
The Mac deployment helper now resolves its own folder automatically and uses Supabase API deployment with debug output.


FINAL 2026-08-28 UPDATE: Main and breakfast customer name/phone are required. Cocoa Tea and Local Juice remain breakfast-only.
