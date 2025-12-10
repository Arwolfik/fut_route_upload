const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

// Поля для загрузки маршрута
const ROUTE_FIELD_ID = "cw34jpocemru1dn";
const DATE_FIELD_ROUTE = "cu7xa90kqnjqi00"; // дата загрузки маршрута

let currentRecordId = null;
let userPlatform = null;
let rawUserId = null;

const screens = {
    upload1: document.getElementById("uploadScreen1"),
    result: document.getElementById("resultScreen")
};

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
}

function showError(msg) {
    document.body.innerHTML = `
        <div style="padding:50px;text-align:center;color:white;font-family:sans-serif;">
            <h2>Ошибка</h2>
            <p style="font-size:18px;margin:30px 0;">${msg}</p>
            <button onclick="location.reload()" style="padding:15px 35px;font-size:17px;">Попробовать снова</button>
        </div>`;
}

// Ждём vkBridge — критически важно для VK Mini Apps 2025
async function waitForVkBridge() {
    return new Promise(resolve => {
        if (window.vkBridge) return resolve(window.vkBridge);
        const check = setInterval(() => {
            if (window.vkBridge) {
                clearInterval(check);
                resolve(window.vkBridge);
            }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(null); }, 5000);
    });
}

// Поиск пользователя по tg-id (Telegram или VK с _VK)
async function findUser(id) {
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${id})`, {
        headers: { "xc-token": API_KEY }
    });
    let data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'tg' };
    }

    const vkValue = id + "_VK";
    res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkValue})`, {
        headers: { "xc-token": API_KEY }
    });
    data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'vk' };
    }

    return null;
}

// Загрузка файла + запись даты по Москве
async function uploadRoute(recordId, file) {
    const form = new FormData();
    form.append("file", file);
    form.append("path", "routes");

    const up = await fetch(FILE_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { "xc-token": API_KEY },
        body: form
    });

    if (!up.ok) throw new Error("Ошибка загрузки файла");

    const info = await up.json();
    const fileData = Array.isArray(info) ? info[0] : info;
    const url = fileData.url || `${BASE_URL}/${fileData.path}`;

    const attachment = [{
        title: fileData.title || file.name,
        mimetype: file.type,
        size: file.size,
        url: url
    }];

    // Дата по московскому времени
    const now = new Date();
    const moscowOffset = 3 * 60; // +3 часа
    const localOffset = now.getTimezoneOffset();
    const moscowTime = new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000);
    const moscowDateTime = moscowTime.toISOString();

    const body = {
        Id: Number(recordId),
        [ROUTE_FIELD_ID]: attachment,
        [DATE_FIELD_ROUTE]: moscowDateTime
    };

    const patch = await fetch(RECORDS_ENDPOINT, {
        method: "PATCH",
        headers: {
            "xc-token": API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!patch.ok) {
        const err = await patch.text();
        throw new Error("Ошибка сохранения в базу");
    }
}

// Фейковый прогресс
async function fakeProgress() {
    const bar = document.getElementById("progress1");
    const status = document.getElementById("status1");
    let p = 0;
    return new Promise(res => {
        const int = setInterval(() => {
            p += 14 + Math.random() * 22;
            if (p >= 100) {
                p = 100;
                clearInterval(int);
                status.textContent = "Маршрут загружен!";
                res();
            }
            bar.style.width = p + "%";
            status.textContent = `Загрузка ${Math.round(p)}%`;
        }, 110);
    });
}

// =================================== СТАРТ ===================================
(async () => {
    try {
        let found = false;

        // 1. Проверяем VK
        const bridge = await waitForVkBridge();
        if (bridge) {
            await bridge.send("VKWebAppInit");
            const info = await bridge.send("VKWebAppGetUserInfo");
            rawUserId = info.id;
            userPlatform = "vk";
            found = true;
            console.log("VK пользователь:", rawUserId);
        }

        // 2. Если не VK — Telegram
        if (!found && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = tg.initDataUnsafe.user.id;
            userPlatform = "tg";
            found = true;
            console.log("Telegram пользователь:", rawUserId);
        }

        if (!found) throw new Error("Платформа не поддерживается");

        // 3. Ищем в базе
        const user = await findUser(rawUserId);
        if (!user) throw new Error("Вы не зарегистрированы. Напишите в бот");

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        // 4. Всё ок — показываем экран загрузки маршрута
        showScreen("upload1");

    } catch (err) {
        console.error(err);
        showError(err.message || "Ошибка запуска приложения");
    }
})();

// =================================== ЗАГРУЗКА МАРШРУТА ===================================
document.getElementById("submitFile1")?.addEventListener("click", async () => {
    const input = document.getElementById("fileInput1");
    const error = document.getElementById("error1");
    const file = input.files[0];

    error.classList.add("hidden");

    if (!file) return error.textContent = "Выберите файл", error.classList.remove("hidden");
    if (file.size > 15 * 1024 * 1024) return error.textContent = "Файл больше 15 МБ", error.classList.remove("hidden");

    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) return error.textContent = "Только PDF или фото", error.classList.remove("hidden");

    try {
        await fakeProgress();
        await uploadRoute(currentRecordId, file);
        showScreen("result");
    } catch (e) {
        error.textContent = e.message || "Ошибка загрузки";
        error.classList.remove("hidden");
    }
});

// Закрытие приложения
document.getElementById("closeApp")?.addEventListener("click", () => {
    if (userPlatform === "vk" && window.vkBridge) {
        vkBridge.send("VKWebAppClose", { status: "success" });
    } else if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.close();
    }
});