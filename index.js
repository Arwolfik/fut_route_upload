const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

const RECORDS_ENDPOINT = BASE_URL + "/api/v2/tables/" + TABLE_ID + "/records";
const FILE_UPLOAD_ENDPOINT = BASE_URL + "/api/v2/storage/upload";

// Поля для загрузки маршрута
const ROUTE_FIELD_ID = "cw34jpocemru1dn";
const DATE_FIELD_ROUTE = "cu7xa90kqnjqi00"; // дата загрузки маршрута

let currentRecordId = null;
let userPlatform = null;
let rawUserId = null;

var screens = {
    upload1: document.getElementById("uploadScreen1"),
    result: document.getElementById("resultScreen")
};

// ================== ВСПОМОГАТЕЛЬНЫЕ ==================

function showScreen(name) {
    var all = document.querySelectorAll(".screen");
    for (var i = 0; i < all.length; i++) {
        all[i].classList.add("hidden");
    }
    if (screens[name]) {
        screens[name].classList.remove("hidden");
    }
}

function showInlineError(msg) {
    var error = document.getElementById("error1");
    if (!error) return;
    error.textContent = msg;
    error.classList.remove("hidden");
}

function clearInlineError() {
    var error = document.getElementById("error1");
    if (!error) return;
    error.textContent = "";
    error.classList.add("hidden");
}

// Критическая ошибка (если вообще всё упало)
function showErrorFatal(msg) {
    document.body.className = "";
    document.body.innerHTML = '' +
        '<div style="' +
        'background:#20232a;' +
        'color:#fff;' +
        'min-height:100vh;' +
        'display:flex;' +
        'align-items:center;' +
        'justify-content:center;' +
        'text-align:center;' +
        'padding:40px 20px;' +
        'box-sizing:border-box;' +
        '">' +
        '<div>' +
        '<h2>Ошибка</h2>' +
        '<p style="font-size:18px;margin:25px 0;">' + msg + '</p>' +
        '<button onclick="location.reload()" style="' +
        'padding:12px 30px;' +
        'font-size:16px;' +
        'border-radius:8px;' +
        'border:none;' +
        'cursor:pointer;' +
        '">' +
        'Попробовать снова' +
        '</button>' +
        '</div>' +
        '</div>';
}

// Поиск пользователя по tg-id (Telegram или VK с _VK)
function findUser(id) {
    return fetch(RECORDS_ENDPOINT + "?where=(tg-id,eq," + id + ")", {
        headers: { "xc-token": API_KEY }
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.list && data.list.length > 0) {
                var rec = data.list[0];
                return { recordId: rec.Id || rec.id, platform: "tg" };
            }

            var vkValue = id + "_VK";
            return fetch(RECORDS_ENDPOINT + "?where=(tg-id,eq," + vkValue + ")", {
                headers: { "xc-token": API_KEY }
            })
                .then(function (res2) { return res2.json(); })
                .then(function (data2) {
                    if (data2.list && data2.list.length > 0) {
                        var rec2 = data2.list[0];
                        return { recordId: rec2.Id || rec2.id, platform: "vk" };
                    }
                    return null;
                });
        });
}

// Загрузка файла маршрута + запись даты по Москве
function uploadRoute(recordId, file) {
    if (!recordId) {
        return Promise.reject(new Error("Техническая ошибка: не найдена запись пользователя в базе."));
    }

    var form = new FormData();
    form.append("file", file);
    form.append("path", "routes");

    return fetch(FILE_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { "xc-token": API_KEY },
        body: form
    })
        .then(function (up) {
            if (!up.ok) throw new Error("Ошибка загрузки файла на сервер.");
            return up.json();
        })
        .then(function (info) {
            var fileData = (Object.prototype.toString.call(info) === "[object Array]") ? info[0] : info;
            var url = fileData.url || (BASE_URL + "/" + fileData.path);

            var attachment = [{
                title: fileData.title || file.name,
                mimetype: file.type,
                size: file.size,
                url: url
            }];

            // Дата по московскому времени
            var now = new Date();
            var localOffset = now.getTimezoneOffset(); // в минутах
            var moscowOffset = 3 * 60; // Москва UTC+3
            var moscowTime = new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000);
            var moscowDateTime = moscowTime.toISOString();

            var body = {
                Id: Number(recordId),
                // поле с файлом
                // @ts-ignore
                [ROUTE_FIELD_ID]: attachment,
                // поле с датой
                // @ts-ignore
                [DATE_FIELD_ROUTE]: moscowDateTime
            };

            return fetch(RECORDS_ENDPOINT, {
                method: "PATCH",
                headers: {
                    "xc-token": API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
        })
        .then(function (patch) {
            if (!patch.ok) {
                return patch.text().then(function (errText) {
                    console.error("PATCH error:", errText);
                    throw new Error("Ошибка сохранения в базу.");
                });
            }
        });
}

// Фейковый прогресс
function fakeProgress() {
    var bar = document.getElementById("progress1");
    var status = document.getElementById("status1");
    var p = 0;
    return new Promise(function (res) {
        var int = setInterval(function () {
            p += 14 + Math.random() * 22;
            if (p >= 100) {
                p = 100;
                clearInterval(int);
                status.textContent = "Маршрут загружен!";
                res();
            }
            bar.style.width = p + "%";
            status.textContent = "Загрузка " + Math.round(p) + "%";
        }, 110);
    });
}

// ================== СТАРТ ===================
(function () {
    // Старая добрая конструкция без async/await, чтобы точно всё парсилось
    try {
        // Сразу показываем экран, чтобы не было белого экрана
        showScreen("upload1");

        // Определяем платформу
        // 1. Telegram
        if (window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initDataUnsafe &&
            window.Telegram.WebApp.initDataUnsafe.user &&
            window.Telegram.WebApp.initDataUnsafe.user.id) {

            var tg = window.Telegram.WebApp;
            try {
                tg.ready();
                tg.expand();
            } catch (e) {
                console.log("Telegram ready/expand error:", e);
            }

            rawUserId = tg.initDataUnsafe.user.id;
            userPlatform = "tg";
            console.log("Telegram пользователь:", rawUserId);

            // ищем пользователя
            findUser(rawUserId)
                .then(function (user) {
                    if (!user) {
                        showInlineError("Вы не зарегистрированы. Напишите в бот, чтобы привязать аккаунт.");
                        var btn = document.getElementById("submitFile1");
                        if (btn) btn.disabled = true;
                        return;
                    }
                    currentRecordId = user.recordId;
                    userPlatform = user.platform;
                    console.log("Найдена запись в базе:", currentRecordId, userPlatform);
                })
                .catch(function (dbErr) {
                    console.error("Ошибка при поиске пользователя:", dbErr);
                    showInlineError("Не удалось получить данные пользователя. Попробуйте позже.");
                });

        }
        // 2. VK Mini Apps
        else if (window.vkBridge) {
            window.vkBridge.send("VKWebAppInit")
                .then(function () {
                    return window.vkBridge.send("VKWebAppGetUserInfo");
                })
                .then(function (info) {
                    if (info && info.id) {
                        rawUserId = info.id;
                        userPlatform = "vk";
                        console.log("VK пользователь:", rawUserId);

                        return findUser(rawUserId);
                    } else {
                        throw new Error("Не удалось получить VK ID");
                    }
                })
                .then(function (user) {
                    if (!user) {
                        showInlineError("Вы не зарегистрированы. Напишите в бот, чтобы привязать аккаунт.");
                        var btn = document.getElementById("submitFile1");
                        if (btn) btn.disabled = true;
                        return;
                    }
                    currentRecordId = user.recordId;
                    userPlatform = user.platform;
                    console.log("Найдена запись в базе:", currentRecordId, userPlatform);
                })
                .catch(function (vkErr) {
                    console.error("VK init / поиск пользователя ошибка:", vkErr);
                    showErrorFatal("Ошибка инициализации VK Mini Apps. Откройте приложение из VK или попробуйте позже.");
                });

        } else {
            // ни Telegram, ни VK — явно открыли не там
            showErrorFatal("Откройте приложение из Telegram-бота или VK Mini Apps.");
        }
    } catch (err) {
        console.error("Критическая ошибка запуска:", err);
        showErrorFatal("Критическая ошибка запуска приложения.");
    }
})();

// ================== ЗАГРУЗКА МАРШРУТА ===================
var submitBtn = document.getElementById("submitFile1");
if (submitBtn) {
    submitBtn.addEventListener("click", function () {
        var input = document.getElementById("fileInput1");
        var file = input && input.files ? input.files[0] : null;

        clearInlineError();

        if (!file) {
            showInlineError("Выберите файл.");
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            showInlineError("Файл больше 15 МБ.");
            return;
        }

        var allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp"
        ];

        if (allowed.indexOf(file.type) === -1) {
            showInlineError("Допустимы только PDF, DOCX, XLSX или изображение.");
            return;
        }

        fakeProgress()
            .then(function () {
                return uploadRoute(currentRecordId, file);
            })
            .then(function () {
                showScreen("result");
            })
            .catch(function (e) {
                console.error("Ошибка загрузки:", e);
                showInlineError(e.message || "Ошибка загрузки.");
            });
    });
}

// Закрытие приложения
var closeBtn = document.getElementById("closeApp");
if (closeBtn) {
    closeBtn.addEventListener("click", function () {
        if (userPlatform === "vk" && window.vkBridge) {
            window.vkBridge.send("VKWebAppClose", { status: "success" });
        } else if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.close();
        } else {
            window.close();
        }
    });
}
