"""Explicit English/Russian message catalog for user-facing backend text."""
import re


_MESSAGES = {
    "Account access is blocked": "Доступ к аккаунту заблокирован",
    "Account is not approved": "Аккаунт ещё не одобрен",
    "Choose a role before approving the account": "Выберите роль перед одобрением аккаунта",
    "Keep an enabled login provider linked to an active administrator": "Оставьте включённый способ входа, привязанный к действующему администратору",
    "Cannot remove the last active administrator": "Нельзя удалить или заблокировать последнего администратора",
    "Password login is disabled": "Вход по паролю отключён",
    "Invalid or expired authentication challenge": "Запрос подтверждения недействителен или истёк. Войдите снова",
    "Sign in again to change security settings": "Войдите снова для изменения настроек безопасности",
    "Confirm a second factor to change security settings": "Подтвердите второй фактор для изменения настроек безопасности",
    "Passkeys are not configured for this origin": "Ключи доступа не настроены для этого адреса сайта",
    "Maximum number of passkeys reached": "Достигнуто максимальное количество ключей доступа",
    "Passkey verification failed": "Не удалось проверить ключ доступа",
    "Passkey is already registered": "Ключ доступа уже зарегистрирован",
    "No passkeys registered": "Нет зарегистрированных ключей доступа",
    "Primary login required": "Сначала выполните вход",
    "Passkey not found": "Ключ доступа не найден",
    "Device not found": "Устройство не найдено",
    "Too many second-factor attempts": "Слишком много попыток подтверждения второго фактора",
    "Choose either automatic or manual test ID": "Выберите автоматический или ручной ID тест-кейса",
    "Automatic test ID range exhausted": "Диапазон автоматических ID тест-кейсов исчерпан",
    "Folder not found": "Папка не найдена",
    "Folder ID already exists": "Идентификатор папки уже существует",
    "Folder has {children} sub-folders and {tests} tests — move or delete them first":
        "В папке {children} вложенных папок и {tests} тестов — сначала переместите или удалите их",
    "File type '{extension}' not allowed. Allowed: {allowed}": "Тип файла '{extension}' не поддерживается. Допустимые типы: {allowed}",
    "File exceeds {size}MB limit": "Размер файла превышает ограничение {size} МБ",
    "Rate limit exceeded: {count} AI requests per hour. Try again later.":
        "Превышено ограничение: не более {count} запросов к ИИ в час. Попробуйте позже.",
    "Too many attempts. Try again in {seconds}s": "Слишком много попыток. Повторите через {seconds} с",
    "Invalid TOTP code — check your authenticator app clock": "Неверный код TOTP — проверьте часы приложения-аутентификатора",
    "No VCS integration matches this test's repo — configure one first":
        "Для репозитория этого теста нет интеграции с системой контроля версий — сначала настройте ее",
    "Defect already linked to {key}": "Дефект уже связан с {key}",
    "invalid JSON: {message}": "недопустимый JSON: {message}",
    "invalid YAML: {message}": "недопустимый YAML: {message}",
    "entity_type must be one of: {types}": "entity_type должен быть одним из значений: {types}",
    "field_type must be one of: {types}": "field_type должен быть одним из значений: {types}",
    "Custom field '{key}' already exists for {entity}": "Дополнительное поле '{key}' уже существует для {entity}",
    "Custom field not found": "Дополнительное поле не найдено",
    "Token not found": "Токен не найден",
    "Your role can only create read-scoped tokens.": "Ваша роль позволяет создавать только токены с доступом для чтения.",
    "This account signs in with a social provider and has no password. Sign in with your original provider, then link this one from Settings.":
        "Для входа в эту учетную запись используется внешний провайдер, пароль не задан. Войдите через исходного провайдера, затем привяжите этот способ в настройках.",
    "Password must be at least {length} characters": "Пароль должен содержать не менее {length} символов",
    "Password must be at most {length} characters": "Пароль должен содержать не более {length} символов",
    "Password must not contain your username or email": "Пароль не должен содержать имя пользователя или адрес электронной почты",
    "This API token is read-only.": "Этот API-токен доступен только для чтения.",
    "Too many failed login attempts. Try again later.": "Слишком много неудачных попыток входа. Попробуйте позже.",
    "Self-registration is disabled on this instance. Ask an administrator for an account.":
        "Самостоятельная регистрация отключена. Обратитесь к администратору, чтобы создать учетную запись.",
    "We need a verified email from the provider to continue.": "Для продолжения необходим подтвержденный адрес почты от провайдера.",
    "Your provider email must be verified to continue.": "Для продолжения необходимо подтвердить адрес почты у провайдера.",
    "No ThoroTest account is linked to this identity, and self-registration is disabled.":
        "К этой учетной записи не привязан профиль ThoroTest, а самостоятельная регистрация отключена.",
    "AI provider 'openai' requires the openai package (pip install openai)":
        "Для провайдера ИИ 'openai' требуется пакет openai (pip install openai)",
    "AI service unavailable (upstream rejected request: {message})":
        "Служба ИИ недоступна: внешний сервис отклонил запрос ({message})",
    "Not a VCS integration: {message}": "Это не интеграция с системой контроля версий: {message}",
    "Not a GitLab integration: {message}": "Это не интеграция с GitLab: {message}",
    "Not a GitHub integration: {message}": "Это не интеграция с GitHub: {message}",
    "Dispatch failed: {message}": "Не удалось запустить задачу: {message}",
    "Unsafe Slack webhook URL: {message}": "Небезопасный URL вебхука Slack: {message}",
    "Unsafe webhook URL: {message}": "Небезопасный URL вебхука: {message}",
    "Unsafe integration URL: {message}": "Небезопасный URL интеграции: {message}",
    "'{key}' must be a string": "Значение '{key}' должно быть строкой",
    "'{key}' must be a number": "Значение '{key}' должно быть числом",
    "'{key}' must be true or false": "Значение '{key}' должно быть true или false",
    "'{key}' must be a date (YYYY-MM-DD)": "Значение '{key}' должно быть датой (ГГГГ-ММ-ДД)",
    "'{key}' must be one of: {options}": "Значение '{key}' должно быть одним из: {options}",
    "Unknown custom field(s): {fields}": "Неизвестные дополнительные поля: {fields}",
    "'{key}' is required and cannot be cleared": "Поле '{key}' обязательно и не может быть очищено",
    "Missing required custom field(s): {fields}": "Не заполнены обязательные дополнительные поля: {fields}",
    "Unknown test id(s): {ids}": "Неизвестные идентификаторы тестов: {ids}",
    "2FA recovery code required": "Требуется код восстановления двухфакторной аутентификации",
    "Not a git source": "Источник не является Git-репозиторием",
    "Test is not linked to a git source": "Тест не связан с Git-источником",
    "Input should be a valid URL": "Укажите корректный URL",
    "Input should be a valid date or datetime": "Укажите корректную дату или дату и время",
    "Input should be a valid UUID": "Укажите корректный UUID",
    "Input should be a valid JSON": "Укажите корректный JSON",
    "Input should be a valid Python object": "Укажите корректный объект Python",
    "String should match pattern '{pattern}'": "Строка должна соответствовать шаблону '{pattern}'",
    "Input should be {expected}": "Значение должно быть: {expected}",
    "Test not found": "Тест не найден",
    "Test ID already exists": "Идентификатор теста уже существует",
    "Run not found": "Запуск не найден",
    "Run ID already exists": "Идентификатор запуска уже существует",
    "RunCase not found": "Результат теста не найден",
    "No failed or blocked cases to retest": "Нет неудачных или заблокированных тестов для повторного запуска",
    "Only leads can assign cases": "Назначать тесты могут только руководители",
    "Invalid status: {status}": "Недопустимый статус: {status}",
    "Plan not found": "План не найден",
    "Plan has no tests": "В плане нет тестов",
    "Pipeline not found": "Пайплайн не найден",
    "Project not found": "Проект не найден",
    "Project ID already exists": "Идентификатор проекта уже существует",
    "Category not found": "Категория не найдена",
    "Category ID already exists": "Идентификатор категории уже существует",
    "Defect not found": "Дефект не найден",
    "No Jira integration configured": "Интеграция с Jira не настроена",
    "Requirement not found": "Требование не найдено",
    "Unknown entity type": "Неизвестный тип объекта",
    "Integration not found": "Интеграция не найдена",
    "Integration ID already exists": "Идентификатор интеграции уже существует",
    "Job not found": "Задача не найдена",
    "Webhook not found": "Вебхук не найден",
    "Attachment not found": "Вложение не найдено",
    "File not found on disk": "Файл не найден на диске",
    "Invalid entity_type": "Недопустимый тип объекта",
    "Invalid attachment path": "Недопустимый путь к вложению",
    "Unknown format: {format}": "Неизвестный формат: {format}",
    "File too large (max 10 MB)": "Файл слишком большой (максимум 10 МБ)",
    "column_mapping must be valid JSON": "column_mapping должен содержать корректный JSON",
    "source must start with 'cli://'": "source должен начинаться с 'cli://'",
    "duplicate path in payload: {path}": "Повторяющийся путь в запросе: {path}",
    "{path}: file exceeds {size} bytes": "{path}: размер файла превышает {size} байт",
    "format must be 'csv' or 'pdf'": "Формат должен быть 'csv' или 'pdf'",
    "format must be 'csv'": "Формат должен быть 'csv'",
    "Email already registered": "Эта почта уже зарегистрирована",
    "Email already in use": "Эта почта уже используется",
    "Username taken": "Имя пользователя уже занято",
    "Username already taken": "Имя пользователя уже занято",
    "Invalid credentials": "Неверные учетные данные",
    "Current password is incorrect": "Текущий пароль указан неверно",
    "Invalid or expired reset token": "Ссылка для сброса пароля недействительна или устарела",
    "Not authenticated": "Требуется войти в систему",
    "Insufficient permissions": "Недостаточно прав",
    "Cannot delete yourself": "Нельзя удалить собственную учетную запись",
    "User not found": "Пользователь не найден",
    "Password is too common": "Этот пароль слишком распространен",
    "Invalid token scope": "Недопустимая область действия токена",
    "Invalid or expired token": "Токен недействителен или устарел",
    "API tokens cannot open WebSockets": "API-токены не могут подключаться к WebSocket",
    "Invalid session": "Сеанс недействителен",
    "Invalid code": "Неверный код",
    "2FA already enabled": "Двухфакторная аутентификация уже включена",
    "2FA not enabled": "Двухфакторная аутентификация не включена",
    "Invalid or expired OAuth state": "Состояние OAuth недействительно или устарело",
    "OAuth provider not found": "Провайдер OAuth не найден",
    "This OAuth provider is disabled": "Этот провайдер OAuth отключен",
    "Link session expired. Please try signing in again.": "Срок действия сеанса привязки истек. Войдите еще раз.",
    "Incorrect password.": "Неверный пароль.",
    "No run history found for this test": "Для этого теста не найдена история запусков",
    "Folder has no tests to analyze": "В папке нет тестов для анализа",
    "folder_id is required": "Поле folder_id обязательно",
    "prompt is required": "Поле prompt обязательно",
    "AI returned invalid response format": "ИИ вернул ответ в недопустимом формате",
    "AI features not configured (ANTHROPIC_API_KEY missing)": "Функции ИИ не настроены (не задан ANTHROPIC_API_KEY)",
    "AI features not configured (AI_MODEL missing)": "Функции ИИ не настроены (не задан AI_MODEL)",
    "AI features misconfigured (invalid API key)": "Функции ИИ настроены неверно (недействительный API-ключ)",
    "Could not reach AI service": "Не удалось связаться со службой ИИ",
    "AI service temporarily unavailable (upstream rate limit). Try again in a moment.":
        "Служба ИИ временно недоступна из-за ограничения запросов. Попробуйте позже.",
    "file must contain a list of requirements": "Файл должен содержать список требований",
    "select fields need at least one option": "Для поля выбора нужен хотя бы один вариант",
    "key must be lowercase letters, digits or _ (max 64 chars)": "Ключ должен содержать строчные латинские буквы, цифры или _ (до 64 символов)",
    "Invalid path component": "Недопустимая часть пути",
    "Invalid path": "Недопустимый путь",
    "Field required": "Поле обязательно",
    "Not Found": "Не найдено",
    "If that email exists, a reset link has been sent.": "Если адрес зарегистрирован, на него отправлена ссылка для сброса пароля.",
    "Input should be a valid string": "Значение должно быть строкой",
    "Input should be a valid integer": "Значение должно быть целым числом",
    "Input should be a valid number": "Значение должно быть числом",
    "Input should be a valid boolean": "Значение должно быть логическим (true или false)",
    "Input should be a valid list": "Значение должно быть списком",
    "Input should be a valid dictionary": "Значение должно быть объектом",
    "Input should be a valid email address": "Укажите корректный адрес электронной почты",
    "String should have at least {min_length} characters": "Длина строки должна быть не меньше {min_length} символов",
    "String should have at most {max_length} characters": "Длина строки не должна превышать {max_length} символов",
    "Input should be less than or equal to {le}": "Значение должно быть не больше {le}",
    "Input should be greater than or equal to {ge}": "Значение должно быть не меньше {ge}",
    "unable to parse string as an integer": "не удалось преобразовать строку в целое число",
    "unable to parse string as a number": "не удалось преобразовать строку в число",
    "notification.run_complete": "Запуск «{name}»: {status}",
    "notification.consecutive_fail": "Тест «{title}» завершился неудачей {count} раз подряд",
    "notification.comment": "{actor} прокомментировал тест «{title}»",
    "notification.mention": "{actor} упомянул вас в «{title}»",
    "notification.assignment": "{actor} назначил вам {entity} «{title}»",
    "email.reset.subject": "Сбросьте пароль ThoroTest",
    "email.reset.body": (
        "Запрошен сброс пароля для вашей учетной записи ThoroTest.\n\n"
        "Перейдите по ссылке, чтобы задать новый пароль (ссылка действительна {hours} ч.):\n\n"
        "  {link}\n\n"
        "Если вы не запрашивали сброс, проигнорируйте это письмо."
    ),
}

_ENGLISH_MESSAGES = {
    "notification.run_complete": "Run '{name}' {status}",
    "notification.consecutive_fail": "'{title}' failed {count}x in a row",
    "notification.comment": "{actor} commented on '{title}'",
    "notification.mention": "{actor} mentioned you on '{title}'",
    "notification.assignment": "{actor} assigned you {entity} '{title}'",
    "email.reset.subject": "Reset your ThoroTest password",
    "email.reset.body": (
        "A password reset was requested for your ThoroTest account.\n\n"
        "Open this link to choose a new password (valid for {hours} hour):\n\n"
        "  {link}\n\n"
        "If you did not request this, you can ignore this email."
    ),
}


def language_from_header(value: str | None) -> str:
    """Return the preferred supported language in an Accept-Language header."""
    supported = []
    for order, preference in enumerate((value or "").split(",")):
        language, *parameters = preference.strip().split(";")
        quality = 1.0
        for parameter in parameters:
            name, _, raw_value = parameter.strip().partition("=")
            if name.lower() == "q":
                try:
                    quality = float(raw_value)
                except ValueError:
                    quality = 0.0
        language = language.strip().lower().replace("_", "-")
        if quality > 0:
            if language == "ru" or language.startswith("ru-"):
                supported.append((quality, -order, "ru"))
            elif language == "en" or language.startswith("en-"):
                supported.append((quality, -order, "en"))
    return max(supported)[2] if supported else "en"


def normalize_language(value: str | None) -> str:
    language = (value or "en").strip().lower().replace("_", "-")
    return "ru" if language == "ru" or language.startswith("ru-") else "en"


def notification_status(value: str, language: str | None) -> str:
    """Translate known run-status labels for notification prose only."""
    if normalize_language(language) != "ru":
        return value
    return {
        "pass": "пройден",
        "fail": "не пройден",
        "running": "выполняется",
        "pending": "ожидает запуска",
        "blocked": "заблокирован",
        "cancelled": "отменен",
    }.get(value, value)


def notification_entity_label(value: str, language: str | None) -> str:
    """Translate known entity labels for notification prose only."""
    if normalize_language(language) != "ru":
        return value
    return {
        "test": "тест",
        "defect": "дефект",
        "requirement": "требование",
        "run": "запуск",
    }.get(value, value)


def _substitute(template: str, values: dict) -> str:
    return re.sub(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", lambda match: str(values[match.group(1)]), template)


def _translate_template(message: str, values: dict) -> str:
    for source, translated in _MESSAGES.items():
        if "{" not in source:
            continue
        pattern = re.escape(source)
        pattern = re.sub(r"\\\{([a-zA-Z_][a-zA-Z0-9_]*)\\\}", r"(?P<\1>.+?)", pattern)
        match = re.fullmatch(pattern, message)
        if match:
            return _substitute(translated, match.groupdict())
    return _substitute(message, values) if values else message


def translate(message: str, language: str | None, **values) -> str:
    """Translate a catalog message; unknown text and interpolated data stay intact."""
    if normalize_language(language) != "ru":
        template = _ENGLISH_MESSAGES.get(message, message)
        return _substitute(template, values) if values else template
    template = _MESSAGES.get(message)
    if template is not None:
        return _substitute(template, values) if values else template
    return _translate_template(message, values)


def translate_validation_errors(errors: list[dict], language: str) -> list[dict]:
    """Translate only validation prose; preserve locations, inputs, and context."""
    translated = []
    for error in errors:
        item = dict(error)
        message = str(item.get("msg", ""))
        base, separator, suffix = message.partition(", ")
        translated_base = translate(base, language)
        translated_suffix = translate(suffix, language) if separator else suffix
        if separator and translated_base != base and translated_suffix != suffix:
            item["msg"] = f"{translated_base}: {translated_suffix}"
        else:
            item["msg"] = translate(message, language)
        translated.append(item)
    return translated
