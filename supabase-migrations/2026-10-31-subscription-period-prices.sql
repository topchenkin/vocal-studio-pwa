-- VIP monthly 2990. Duo VIP keeps ~1.5×. Period discounts live in pay-api + client.

update public.subscription_products
set price_rub = 2990
where code = 'vip';

update public.subscription_products
set price_rub = 4490
where code = 'vip_duo';
