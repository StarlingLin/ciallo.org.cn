(() =>
{
    "use strict";

    const buttons = Array.from(document.querySelectorAll(".tab-button"));
    const homePanel = document.getElementById("home-panel");
    const gamePanel = document.getElementById("game-panel");
    const gameFrame = document.getElementById("game-frame");
    const loading = document.getElementById("game-loading");
    const pageTitle = document.getElementById("page-title");
    const reloadButton = document.getElementById("reload-button");
    const fullscreenButton = document.getElementById("fullscreen-button");

    let currentTab = "home";
    let currentGameSrc = "";

    function getTabButton(tab)
    {
        return buttons.find((button) => button.dataset.tab === tab);
    }

    function normalizeTab(tab)
    {
        return getTabButton(tab) ? tab : "home";
    }

    function setActiveButton(tab)
    {
        for (const button of buttons)
        {
            const active = button.dataset.tab === tab;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        }
    }

    function showHome()
    {
        homePanel.hidden = false;
        gamePanel.hidden = true;
        pageTitle.textContent = "柚子厨的HTML小游戏聚合";
        reloadButton.disabled = true;
        fullscreenButton.disabled = true;
        document.title = "柚子厨的 HTML 小游戏聚合";
    }

    function showGame(button)
    {
        const src = button.dataset.gameSrc;
        const title = button.dataset.gameTitle || button.textContent.trim();

        homePanel.hidden = true;
        gamePanel.hidden = false;
        pageTitle.textContent = title;
        reloadButton.disabled = false;
        fullscreenButton.disabled = false;
        document.title = `${title} · 柚子厨的 HTML 小游戏聚合`;

        if (src !== currentGameSrc)
        {
            currentGameSrc = src;
            loading.classList.remove("is-hidden");
            gameFrame.src = src;
        }
    }

    function switchTab(tab, updateHistory = true)
    {
        const normalized = normalizeTab(tab);
        const button = getTabButton(normalized);

        currentTab = normalized;
        setActiveButton(normalized);

        if (normalized === "home")
        {
            showHome();
        }
        else
        {
            showGame(button);
        }

        if (updateHistory)
        {
            const hash = `#${normalized}`;
            if (window.location.hash !== hash)
            {
                history.pushState({ tab: normalized }, "", hash);
            }
        }
    }

    for (const button of buttons)
    {
        button.addEventListener("click", () =>
        {
            switchTab(button.dataset.tab);
        });

        button.addEventListener("keydown", (event) =>
        {
            const index = buttons.indexOf(button);
            let nextIndex = null;

            if (event.key === "ArrowDown" || event.key === "ArrowRight")
            {
                nextIndex = (index + 1) % buttons.length;
            }
            else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
            {
                nextIndex = (index - 1 + buttons.length) % buttons.length;
            }
            else if (event.key === "Home")
            {
                nextIndex = 0;
            }
            else if (event.key === "End")
            {
                nextIndex = buttons.length - 1;
            }

            if (nextIndex !== null)
            {
                event.preventDefault();
                buttons[nextIndex].focus();
                switchTab(buttons[nextIndex].dataset.tab);
            }
        });
    }

    document.querySelectorAll("[data-open-tab]").forEach((element) =>
    {
        const open = () =>
        {
            switchTab(element.dataset.openTab);
        };

        element.addEventListener("click", open);
        element.addEventListener("keydown", (event) =>
        {
            if (event.key === "Enter" || event.key === " ")
            {
                event.preventDefault();
                open();
            }
        });
    });

    gameFrame.addEventListener("load", () =>
    {
        window.setTimeout(() =>
        {
            loading.classList.add("is-hidden");
        }, 180);
    });

    reloadButton.addEventListener("click", () =>
    {
        if (!currentGameSrc)
        {
            return;
        }

        loading.classList.remove("is-hidden");
        gameFrame.src = currentGameSrc;
    });

    fullscreenButton.addEventListener("click", async () =>
    {
        try
        {
            if (gameFrame.requestFullscreen)
            {
                await gameFrame.requestFullscreen();
            }
        }
        catch (error)
        {
            console.error("无法进入全屏：", error);
        }
    });

    window.addEventListener("hashchange", () =>
    {
        switchTab(window.location.hash.slice(1), false);
    });

    window.addEventListener("popstate", () =>
    {
        switchTab(window.location.hash.slice(1), false);
    });

    switchTab(window.location.hash.slice(1) || "home", false);
})();
