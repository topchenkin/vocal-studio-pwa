import os, re, shutil, sys, time

KEY = sys.argv[1]
ROOT = "/opt/supabase"
stamp = time.strftime("%Y%m%d-%H%M%S")
for name in (".env", "docker-compose.yml"):
    shutil.copy2(f"{ROOT}/{name}", f"{ROOT}/{name}.bak-{stamp}")

env_path = f"{ROOT}/.env"
text = open(env_path, encoding="utf-8").read()
updates = {
    "SMTP_ADMIN_EMAIL": "noreply@uniquevocal.ru",
    "SMTP_HOST": "smtp.resend.com",
    "SMTP_PORT": "465",
    "SMTP_USER": "resend",
    "SMTP_PASS": KEY,
    "SMTP_SENDER_NAME": '"Unique Vocal Studio"',
    "ENABLE_PHONE_SIGNUP": "false",
    "ENABLE_PHONE_AUTOCONFIRM": "false",
}
for k, v in updates.items():
    text, n = re.subn(rf"^{k}=.*$", f"{k}={v}", text, flags=re.M)
    if n != 1:
        raise SystemExit(f"env key {k} matched {n}")
open(env_path, "w", encoding="utf-8").write(text)

compose_path = f"{ROOT}/docker-compose.yml"
compose = open(compose_path, encoding="utf-8").read()
if "GOTRUE_PASSWORD_MIN_LENGTH" not in compose:
    base = "https://www.uniquevocal.ru/noprecache/email"
    extra = [
        'GOTRUE_PASSWORD_MIN_LENGTH: "8"',
        "GOTRUE_MAILER_EXTERNAL_HOSTS: www.uniquevocal.ru,uniquevocal.ru",
        'GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Подтвердите почту — Unique Vocal Studio"',
        'GOTRUE_MAILER_SUBJECTS_RECOVERY: "Сброс пароля — Unique Vocal Studio"',
        'GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: "Вход в кабинет — Unique Vocal Studio"',
        'GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: "Смена почты — Unique Vocal Studio"',
        f"GOTRUE_MAILER_TEMPLATES_CONFIRMATION: {base}/confirmation.html",
        f"GOTRUE_MAILER_TEMPLATES_RECOVERY: {base}/recovery.html",
        f"GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: {base}/magic-link.html",
        f"GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: {base}/email-change.html",
    ]
    anchor = re.search(r"^( +)GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE:.*$", compose, flags=re.M)
    if not anchor:
        raise SystemExit("compose anchor not found")
    indent = anchor.group(1)
    block = "".join(f"\n{indent}{line}" for line in extra)
    compose = compose[: anchor.end()] + block + compose[anchor.end():]
    open(compose_path, "w", encoding="utf-8").write(compose)

print("backup", stamp)
os.system(f"cd {ROOT} && docker compose up -d --no-deps auth 2>&1 | tail -3")
for _ in range(30):
    time.sleep(3)
    status = os.popen("docker inspect -f '{{.State.Health.Status}}' supabase-auth").read().strip()
    if status == "healthy":
        break
print("auth", status)
os.system("docker exec supabase-auth env | grep -E '^GOTRUE_(SMTP_HOST|SMTP_PORT|MAILER_AUTOCONFIRM|EXTERNAL_PHONE_ENABLED|PASSWORD_MIN_LENGTH|MAILER_TEMPLATES_RECOVERY)='")
os.system("docker ps --format '{{.Names}} {{.Status}}' | grep -E 'auth|kong'")
