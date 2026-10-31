import re
import shutil
import time
from pathlib import Path

ROOT = Path("/opt/supabase")
stamp = time.strftime("%Y%m%d-%H%M%S")
for name in (".env", "docker-compose.yml"):
    shutil.copy2(ROOT / name, ROOT / f"{name}.bak-mail-{stamp}")

env_path = ROOT / ".env"
env = env_path.read_text(encoding="utf-8")
env_updates = {
    "ENABLE_EMAIL_AUTOCONFIRM": "false",
    "MAILER_SUBJECTS_CONFIRMATION": "Подтвердите почту — Unique Vocal Studio",
    "MAILER_SUBJECTS_RECOVERY": "Сброс пароля — Unique Vocal Studio",
    "MAILER_SUBJECTS_MAGIC_LINK": "Вход в кабинет — Unique Vocal Studio",
    "MAILER_SUBJECTS_EMAIL_CHANGE": "Смена почты — Unique Vocal Studio",
}
for key, value in env_updates.items():
    if re.search(rf"^{key}=", env, flags=re.M):
        env = re.sub(rf"^{key}=.*$", f"{key}={value}", env, flags=re.M, count=1)
    else:
        env += f"\n{key}={value}\n"
env_path.write_text(env, encoding="utf-8")

compose_path = ROOT / "docker-compose.yml"
compose = compose_path.read_text(encoding="utf-8")
replacements = {
    r"^(\s+)GOTRUE_MAILER_EXTERNAL_HOSTS:.*$": r"\1GOTRUE_MAILER_EXTERNAL_HOSTS: www.uniquevocal.ru,uniquevocal.ru,sb.uniquevocal.ru",
    r"^(\s+)GOTRUE_MAILER_SUBJECTS_CONFIRMATION:.*$": r"\1GOTRUE_MAILER_SUBJECTS_CONFIRMATION: ${MAILER_SUBJECTS_CONFIRMATION}",
    r"^(\s+)GOTRUE_MAILER_SUBJECTS_RECOVERY:.*$": r"\1GOTRUE_MAILER_SUBJECTS_RECOVERY: ${MAILER_SUBJECTS_RECOVERY}",
    r"^(\s+)GOTRUE_MAILER_SUBJECTS_MAGIC_LINK:.*$": r"\1GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: ${MAILER_SUBJECTS_MAGIC_LINK}",
    r"^(\s+)GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE:.*$": r"\1GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: ${MAILER_SUBJECTS_EMAIL_CHANGE}",
}
for pattern, repl in replacements.items():
    compose, n = re.subn(pattern, repl, compose, flags=re.M)
    if n != 1:
        raise SystemExit(f"compose replace {pattern} matched {n}")

if "GOTRUE_API_EXTERNAL_URL:" not in compose:
    compose, n = re.subn(
        r"^(\s+)API_EXTERNAL_URL: \$\{API_EXTERNAL_URL\}\s*$",
        r"\1API_EXTERNAL_URL: ${API_EXTERNAL_URL}\n\1GOTRUE_API_EXTERNAL_URL: https://sb.uniquevocal.ru",
        compose,
        count=1,
        flags=re.M,
    )
    if n != 1:
        raise SystemExit(f"insert GOTRUE_API_EXTERNAL_URL matched {n}")

compose_path.write_text(compose, encoding="utf-8")
print("backup", stamp)
