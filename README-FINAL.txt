Pizza Yard breakfast/live-dashboard merge.

Replace/add these files:
- index.html
- dashboard.html
- dashboard.js
- dashboard.css
- breakfast.html
- breakfast.js
- breakfast.css
- breakfast-banner.css

Keep staff.html, staff.js, staff.css unchanged.
Run the breakfast SQL only if public.breakfast_orders does not already exist.

Browser notifications:
- Customers can enable browser notifications from the order confirmation/tracking window.
- Notifications are sent when the tracked pizza order changes status.
- No SMS service is required.
- The tracking page must remain open in the browser for these lightweight browser notifications to work; this build does not use a paid push-notification provider.
