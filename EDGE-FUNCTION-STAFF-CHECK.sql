-- Optional verification only. Do not disable RLS.
select au.id, au.email, su.user_id
from auth.users au
left join public.staff_users su on su.user_id = au.id
where au.email = 'yardpizza758@gmail.com';
