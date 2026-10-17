(function () {
    "use strict";

    const root = document.getElementById("mission-dashboard");
    if (!root) return;

    const userId = root.dataset.userId || "anonymous";
    const storageKey = `schoolhub.dashboard.layout.v1.${userId}`;
    const board = document.getElementById("widget-board");
    const manager = document.getElementById("widget-manager");
    const hiddenList = document.getElementById("hidden-widget-list");
    const editToggle = document.getElementById("dashboard-edit-toggle");
    const resetButton = document.getElementById("dashboard-reset");

    const initialOrder = Array.from(
        board.querySelectorAll(".widget-card")
    ).map(card => card.dataset.widgetId);

    let editMode = false;
    let draggedCard = null;

    const widgetTitle = card =>
        card.dataset.widgetTitle || card.dataset.widgetId;

    const widgets = () =>
        Array.from(board.querySelectorAll(".widget-card"));


    function getState() {
        try {
            const state = JSON.parse(
                localStorage.getItem(storageKey) || "{}"
            );

            return {
                order: Array.isArray(state.order)
                    ? state.order
                    : initialOrder.slice(),

                hidden: Array.isArray(state.hidden)
                    ? state.hidden
                    : [],

                sizes: state.sizes && typeof state.sizes === "object"
                    ? state.sizes
                    : {}
            };

        } catch (_error) {
            return {
                order: initialOrder.slice(),
                hidden: [],
                sizes: {}
            };
        }
    }


    function saveState() {
        const state = {
            order: widgets().map(
                card => card.dataset.widgetId
            ),

            hidden: widgets()
                .filter(card => card.classList.contains("is-hidden"))
                .map(card => card.dataset.widgetId),

            sizes: Object.fromEntries(
                widgets().map(card => [
                    card.dataset.widgetId,
                    card.classList.contains("widget-wide")
                        ? "wide"
                        : "normal"
                ])
            )
        };

        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify(state)
            );

        } catch (error) {
            console.warn(
                "Could not save dashboard layout",
                error
            );
        }

        renderHiddenWidgets();
    }


    function restoreState() {
        const state = getState();

        const cardsById = new Map(
            widgets().map(card => [
                card.dataset.widgetId,
                card
            ])
        );

        const orderedIds = [
            ...state.order,
            ...initialOrder
        ].filter(
            (id, index, all) => all.indexOf(id) === index
        );

        orderedIds.forEach(id => {
            const card = cardsById.get(id);

            if (card) {
                board.appendChild(card);
            }
        });

        widgets().forEach(card => {
            const id = card.dataset.widgetId;

            card.classList.toggle(
                "is-hidden",
                state.hidden.includes(id)
            );

            card.classList.toggle(
                "widget-wide",
                (state.sizes[id] || card.dataset.size) === "wide"
            );
        });

        renderHiddenWidgets();
    }


    function renderHiddenWidgets() {
        const hidden = widgets().filter(
            card => card.classList.contains("is-hidden")
        );

        hiddenList.replaceChildren();

        if (!hidden.length) {
            const message = document.createElement("span");

            message.className = "hidden-widget-empty";

            message.textContent =
                "Все виджеты отображаются. Чтобы скрыть виджет, нажмите × в режиме настройки.";

            hiddenList.appendChild(message);
            return;
        }

        hidden.forEach(card => {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "hidden-widget-item";
            button.dataset.restoreWidget = card.dataset.widgetId;

            button.textContent = `＋ ${widgetTitle(card)}`;

            hiddenList.appendChild(button);
        });
    }


    function setEditMode(enabled) {
        editMode = Boolean(enabled);

        board.classList.toggle("edit-mode", editMode);
        manager.hidden = !editMode;

        editToggle.textContent = editMode
            ? "✓ Готово"
            : "☷ Настроить виджеты";

        editToggle.classList.toggle(
            "primary",
            !editMode
        );

        widgets().forEach(card => {
            card.draggable = editMode;
        });

        renderHiddenWidgets();
    }


    editToggle.addEventListener("click", () => {
        setEditMode(!editMode);
    });


    resetButton.addEventListener("click", () => {
        try {
            localStorage.removeItem(storageKey);
        } catch (_error) {
            // Ничего не делаем.
        }

        initialOrder.forEach(id => {
            const card = board.querySelector(
                `[data-widget-id="${CSS.escape(id)}"]`
            );

            if (card) {
                board.appendChild(card);

                card.classList.remove(
                    "is-hidden",
                    "widget-wide"
                );

                if (card.dataset.size === "wide") {
                    card.classList.add("widget-wide");
                }
            }
        });

        saveState();
        setEditMode(true);
    });


    board.addEventListener("click", event => {
        const control = event.target.closest(
            "[data-widget-action]"
        );

        if (control) {
            const card = control.closest(".widget-card");

            if (!card) return;

            const action = control.dataset.widgetAction;

            if (action === "hide") {
                card.classList.add("is-hidden");
                saveState();

            } else if (action === "size") {
                card.classList.toggle("widget-wide");
                saveState();
            }
        }
    });


    hiddenList.addEventListener("click", event => {
        const button = event.target.closest(
            "[data-restore-widget]"
        );

        if (!button) return;

        const card = board.querySelector(
            `[data-widget-id="${CSS.escape(button.dataset.restoreWidget)}"]`
        );

        if (card) {
            card.classList.remove("is-hidden");
            saveState();
        }
    });


    board.addEventListener("dragstart", event => {
        const handle = event.target.closest(
            ".widget-drag-handle"
        );

        const card = event.target.closest(".widget-card");

        if (!editMode || !handle || !card) {
            event.preventDefault();
            return;
        }

        draggedCard = card;
        card.classList.add("dragging");

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";

            event.dataTransfer.setData(
                "text/plain",
                card.dataset.widgetId
            );
        }
    });


    board.addEventListener("dragover", event => {
        if (!editMode || !draggedCard) return;

        const target = event.target.closest(".widget-card");

        if (
            !target ||
            target === draggedCard ||
            target.classList.contains("is-hidden")
        ) {
            return;
        }

        event.preventDefault();

        board.querySelectorAll(".drop-target").forEach(card => {
            card.classList.remove("drop-target");
        });

        target.classList.add("drop-target");
    });


    board.addEventListener("drop", event => {
        if (!editMode || !draggedCard) return;

        const target = event.target.closest(".widget-card");

        if (
            !target ||
            target === draggedCard ||
            target.classList.contains("is-hidden")
        ) {
            return;
        }

        event.preventDefault();

        const rect = target.getBoundingClientRect();

        const after =
            event.clientY > rect.top + rect.height / 2;

        board.insertBefore(
            draggedCard,
            after ? target.nextSibling : target
        );

        board.querySelectorAll(".drop-target").forEach(card => {
            card.classList.remove("drop-target");
        });

        saveState();
    });


    board.addEventListener("dragend", () => {
        if (draggedCard) {
            draggedCard.classList.remove("dragging");
        }

        draggedCard = null;

        board.querySelectorAll(".drop-target").forEach(card => {
            card.classList.remove("drop-target");
        });

        saveState();
    });


    restoreState();
    setEditMode(false);


    /* =====================================================
       WEATHER: Open-Meteo geocoding + forecast APIs.
       ===================================================== */

    const weatherForm = document.getElementById("weather-form");
    const cityInput = document.getElementById("weather-city");
    const weatherContent = document.getElementById("weather-content");

    const cityStorageKey =
        `schoolhub.dashboard.weather-city.${userId}`;

    const defaultCity = root.dataset.defaultCity || "Tomsk";


    const weatherCodes = {
        0: ["Ясно", "☀️"],
        1: ["Преимущественно ясно", "🌤️"],
        2: ["Переменная облачность", "⛅"],
        3: ["Облачно", "☁️"],
        45: ["Туман", "🌫️"],
        48: ["Изморозь и туман", "🌫️"],
        51: ["Небольшая морось", "🌦️"],
        53: ["Морось", "🌦️"],
        55: ["Сильная морось", "🌧️"],
        56: ["Ледяная морось", "🌧️"],
        57: ["Сильная ледяная морось", "🌧️"],
        61: ["Небольшой дождь", "🌦️"],
        63: ["Дождь", "🌧️"],
        65: ["Сильный дождь", "🌧️"],
        66: ["Ледяной дождь", "🌧️"],
        67: ["Сильный ледяной дождь", "🌧️"],
        71: ["Небольшой снег", "🌨️"],
        73: ["Снег", "🌨️"],
        75: ["Сильный снег", "❄️"],
        77: ["Снежная крупа", "🌨️"],
        80: ["Кратковременный дождь", "🌦️"],
        81: ["Ливни", "🌧️"],
        82: ["Сильные ливни", "🌧️"],
        85: ["Снегопад", "🌨️"],
        86: ["Сильный снегопад", "❄️"],
        95: ["Гроза", "⛈️"],
        96: ["Гроза с градом", "⛈️"],
        99: ["Сильная гроза с градом", "⛈️"]
    };


    function weatherDescription(code) {
        return weatherCodes[code] || [
            "Погодные условия",
            "🌡️"
        ];
    }


    function showWeatherMessage(message) {
        weatherContent.replaceChildren();

        const box = document.createElement("div");

        box.className = "widget-error";
        box.textContent = message;

        weatherContent.appendChild(box);
    }


    async function fetchWeather(city) {
        const cleanCity = (city || "").trim();

        if (!cleanCity) {
            showWeatherMessage(
                "Введите город, чтобы загрузить актуальный прогноз."
            );
            return;
        }

        showWeatherMessage("Загружаем погоду…");

        try {
            const geoUrl = new URL(
                "https://geocoding-api.open-meteo.com/v1/search"
            );

            geoUrl.search = new URLSearchParams({
                name: cleanCity,
                count: "1",
                language: "ru",
                format: "json"
            });

            const geoResponse = await fetch(geoUrl);

            if (!geoResponse.ok) {
                throw new Error("Не удалось найти город.");
            }

            const geo = await geoResponse.json();
            const place = geo.results && geo.results[0];

            if (!place) {
                throw new Error(
                    "Город не найден. Попробуйте указать название точнее."
                );
            }

            const forecastUrl = new URL(
                "https://api.open-meteo.com/v1/forecast"
            );

            forecastUrl.search = new URLSearchParams({
                latitude: String(place.latitude),
                longitude: String(place.longitude),

                current:
                    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",

                daily:
                    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",

                timezone: "auto",
                forecast_days: "5"
            });

            const forecastResponse = await fetch(forecastUrl);

            if (!forecastResponse.ok) {
                throw new Error("Прогноз временно недоступен.");
            }

            const forecast = await forecastResponse.json();

            renderWeather(place, forecast);

            cityInput.value =
                `${place.name}${place.country ? ", " + place.country : ""}`;

            try {
                localStorage.setItem(
                    cityStorageKey,
                    cleanCity
                );
            } catch (_error) {
                // localStorage может быть отключён.
            }

        } catch (error) {
            showWeatherMessage(
                error.message ||
                "Не удалось загрузить погоду. Проверьте подключение к интернету."
            );
        }
    }


    function renderWeather(place, data) {
        const current = data.current || {};
        const daily = data.daily || {};

        const [description, icon] = weatherDescription(
            current.weather_code
        );

        weatherContent.replaceChildren();

        const now = document.createElement("div");
        now.className = "weather-now";

        const left = document.createElement("div");

        const temp = document.createElement("div");
        temp.className = "weather-temp";
        temp.textContent =
            `${Math.round(current.temperature_2m)}°`;

        const condition = document.createElement("div");
        condition.className = "weather-condition";
        condition.textContent = description;

        const name = document.createElement("div");
        name.className = "weather-place";

        name.textContent = [
            place.name,
            place.admin1,
            place.country
        ].filter(Boolean).join(", ");

        left.append(temp, condition, name);

        const symbol = document.createElement("div");
        symbol.className = "weather-symbol";
        symbol.textContent = icon;

        now.append(left, symbol);
        weatherContent.appendChild(now);


        const details = document.createElement("div");
        details.className = "weather-details";

        [
            [
                "ОЩУЩАЕТСЯ",
                `${Math.round(current.apparent_temperature)}°`
            ],
            [
                "ВЛАЖНОСТЬ",
                `${current.relative_humidity_2m ?? "—"}%`
            ],
            [
                "ВЕТЕР",
                `${Math.round(current.wind_speed_10m ?? 0)} км/ч`
            ]
        ].forEach(([label, value]) => {
            const item = document.createElement("div");
            item.className = "weather-detail";

            const labelNode = document.createElement("div");
            labelNode.className = "weather-detail-label";
            labelNode.textContent = label;

            const valueNode = document.createElement("div");
            valueNode.className = "weather-detail-value";
            valueNode.textContent = value;

            item.append(labelNode, valueNode);
            details.appendChild(item);
        });

        weatherContent.appendChild(details);


        const forecast = document.createElement("div");
        forecast.className = "weather-forecast";

        (daily.time || []).forEach((date, index) => {
            const day = document.createElement("div");
            day.className = "forecast-day";

            const dateObj = new Date(`${date}T12:00:00`);

            const dayName = document.createElement("div");
            dayName.className = "forecast-name";

            dayName.textContent = index === 0
                ? "СЕГОДНЯ"
                : dateObj.toLocaleDateString(
                    "ru-RU",
                    { weekday: "short" }
                ).toUpperCase();

            const weatherIcon = document.createElement("div");
            weatherIcon.className = "forecast-icon";

            weatherIcon.textContent =
                weatherDescription(daily.weather_code[index])[1];

            const maxTemp = Math.round(
                daily.temperature_2m_max[index]
            );

            const minTemp = Math.round(
                daily.temperature_2m_min[index]
            );

            const temps = document.createElement("div");
            temps.className = "forecast-temp";
            temps.textContent = `${maxTemp}° / ${minTemp}°`;

            day.append(dayName, weatherIcon, temps);
            forecast.appendChild(day);
        });

        weatherContent.appendChild(forecast);
    }


    weatherForm.addEventListener("submit", event => {
        event.preventDefault();
        fetchWeather(cityInput.value);
    });


    let initialCity = defaultCity;

    try {
        initialCity =
            localStorage.getItem(cityStorageKey) || defaultCity;
    } catch (_error) {
        // Используем город по умолчанию.
    }

    cityInput.value = initialCity;
    fetchWeather(initialCity);


    /* =====================================================
       TRADINGVIEW EMBEDDED CHARTS
       ===================================================== */

    function loadTradingViewChart(containerId, symbol) {
        const container = document.getElementById(containerId);

        if (!container) return;

        const dark =
            document.documentElement.dataset.theme === "dark";

        const params = new URLSearchParams({
            frameElementId: `${containerId}-frame`,
            symbol,
            interval: "D",
            hidesidetoolbar: "1",
            symboledit: "0",
            saveimage: "0",
            toolbarbg: dark ? "16171a" : "f7f7f8",
            theme: dark ? "dark" : "light",
            style: "1",
            timezone: "Etc/UTC",
            withdateranges: "1",
            hideideas: "1",
            hidevolume: "1",
            hidelegend: "1",
            locale: "en"
        });

        const iframe = document.createElement("iframe");

        iframe.id = `${containerId}-frame`;
        iframe.title = `${symbol} TradingView chart`;
        iframe.loading = "lazy";

        iframe.referrerPolicy =
            "strict-origin-when-cross-origin";

        iframe.src =
            `https://s.tradingview.com/widgetembed/?${params.toString()}`;

        container.replaceChildren(iframe);
    }


    loadTradingViewChart("chart-aapl", "NASDAQ:AAPL");
    loadTradingViewChart("chart-tsla", "NASDAQ:TSLA");


    /* =====================================================
       LATEST NEWS — users.dashboard_news endpoint.
       ===================================================== */

    const newsList = document.getElementById("news-list");
    const newsRefresh = document.getElementById("news-refresh");

    let newsLoading = false;


    function makeNewsNode(item, index) {
        const link = document.createElement("a");

        link.className = "news-item";
        link.href = item.url || "#";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const number = document.createElement("div");
        number.className = "news-number";
        number.textContent = String(index + 1).padStart(2, "0");

        const content = document.createElement("div");
        content.className = "news-content";

        const title = document.createElement("div");
        title.className = "news-title";
        title.textContent = item.title || "Без заголовка";

        const meta = document.createElement("div");
        meta.className = "news-meta";

        const source = document.createElement("span");
        source.textContent = item.source || "News";

        const date = document.createElement("span");

        const parsed = item.published_at
            ? new Date(item.published_at)
            : null;

        date.textContent =
            parsed && !Number.isNaN(parsed.getTime())
                ? parsed.toLocaleString(
                    "ru-RU",
                    {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                )
                : "Недавно";

        meta.append(source, date);
        content.append(title, meta);
        link.append(number, content);

        return link;
    }


    async function loadNews() {
        if (newsLoading) return;

        newsLoading = true;
        newsRefresh.disabled = true;

        newsList.replaceChildren();

        const loadingNode = document.createElement("div");
        loadingNode.className = "news-loading";

        const spinner = document.createElement("span");
        spinner.className = "news-spinner";

        const label = document.createElement("span");
        label.textContent = "Загружаем свежие заголовки…";

        loadingNode.append(spinner, label);
        newsList.appendChild(loadingNode);

        try {
            const response = await fetch(root.dataset.newsUrl, {
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                },
                credentials: "same-origin"
            });

            const type =
                response.headers.get("content-type") || "";

            if (!type.includes("application/json")) {
                throw new Error(
                    "Сервер вернул не JSON. Возможно, сессия закончилась."
                );
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Новости временно недоступны."
                );
            }

            newsList.replaceChildren();

            if (!data.items || !data.items.length) {
                const empty = document.createElement("div");

                empty.className = "widget-error";

                empty.textContent =
                    data.error ||
                    "Нет доступных новостей. Попробуйте обновить позже.";

                newsList.appendChild(empty);

            } else {
                data.items.forEach((item, index) => {
                    newsList.appendChild(
                        makeNewsNode(item, index)
                    );
                });
            }

        } catch (error) {
            newsList.replaceChildren();

            const failure = document.createElement("div");

            failure.className = "widget-error";
            failure.textContent =
                error.message || "Новости временно недоступны.";

            newsList.appendChild(failure);

        } finally {
            newsLoading = false;
            newsRefresh.disabled = false;
        }
    }


    newsRefresh.addEventListener("click", loadNews);

    loadNews();

    window.setInterval(
        loadNews,
        10 * 60 * 1000
    );

})();