# Pizza Yard — All Improvements Build

Keeps the existing Pizza Yard customer ordering flow and adds the requested small-business workflow improvements.

## Included
- 12-inch pizzas only
- Whole Pizza and Half & Half
- Veg topping
- Large touch-friendly staff ordering controls
- Optional staff customer name and phone
- Previous-customer lookup
- Repeat last order for returning customers
- Live dashboard with loud alert and text-to-speech order announcements
- Order timers showing elapsed time
- Kitchen Display Mode for a simplified kitchen view
- Ready-status voice announcement; customer tracker updates to Ready
- Daily closing report: orders, sales, average order, online/staff, pickup/delivery
- Busiest-time report
- Most-popular-toppings report
- Customer reviews on the main ordering page
- Staff review approval/hide controls
- Post-order review prompt
- Sold-out topping controls
- Existing customer tracking and order status workflow

## Not included by request
- SMS notifications
- Additional security system previously discussed as #10
- Rewards/loyalty program
- Daily specials
- Pizza photos (to be added when real Pizza Yard photos are provided)

## Database
The existing Pizza Yard Supabase setup remains in place. The Reviews table was already created separately by running the Reviews SQL section. No additional SQL is required for these new dashboard/report/repeat-order features because they use existing order data.
