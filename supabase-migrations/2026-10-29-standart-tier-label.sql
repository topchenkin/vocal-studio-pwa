-- Visible catalog title only. The tier code stays `standard`.

update public.subscription_products
set
  title = replace(title, 'Standard', 'Standart'),
  features = replace(features::text, 'Standard', 'Standart')::jsonb
where title like '%Standard%'
   or features::text like '%Standard%';
