(function () {
  "use strict";

  const PROFILE_KEY = "liftlog_profile";
  const HISTORY_KEY = "liftlog_history";
  const CHAT_KEY = "liftlog_chat";
  const DAY_TITLES_KEY = "liftlog_day_titles";
  const API_SETTINGS_KEY = "liftlog_api_settings";

  const CUSTOM_VALUE = "__custom__";

  const EXERCISE_PARTS = {
    "가슴": ["벤치프레스", "인클라인 프레스", "케이블 크로스오버", "딥스"],
    "등": ["데드리프트", "바벨로우", "랫풀다운", "시티드 케이블 로우", "원 암 덤벨 로우"],
    "하체": ["스쿼트", "핵스쿼트", "레그프레스", "워킹 런지", "레그컬", "레그익스텐션"],
    "어깨": ["오버헤드프레스", "덤벨 숄더 프레스", "사이드 레터럴 레이즈", "프론트 레이즈", "페이스풀", "리어 델트 플라이"],
    "팔": ["바벨 컬", "덤벨 해머 컬", "케이블 트라이셉스 푸쉬다운", "덤벨 라잉 트라이셉스 익스텐션"],
    "유산소·기타": ["행잉 레그레이즈", "인클라인 런닝머신", "스텝밀"],
  };
  const PART_ORDER = Object.keys(EXERCISE_PARTS);

  let editingEntryId = null;

  function findPartForExercise(exercise) {
    return PART_ORDER.find((part) => EXERCISE_PARTS[part].includes(exercise)) || null;
  }

  // ---------- storage ----------

  function loadProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function loadHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function loadChat() {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function saveChat(chat) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chat));
  }

  function loadDayTitles() {
    const raw = localStorage.getItem(DAY_TITLES_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  function saveDayTitles(titles) {
    localStorage.setItem(DAY_TITLES_KEY, JSON.stringify(titles));
  }

  function loadApiSettings() {
    const raw = localStorage.getItem(API_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { provider: "claude", apiKey: "" };
  }

  function saveApiSettings(settings) {
    localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
  }

  // ---------- backup export / import ----------

  function exportData() {
    const data = {
      profile: loadProfile(),
      history: loadHistory(),
      chat: loadChat(),
      dayTitles: loadDayTitles(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liftlog-backup-${todayString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        alert("파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해주세요.");
        return;
      }
      if (!data || typeof data !== "object") {
        alert("올바른 백업 파일이 아니에요.");
        return;
      }

      if (data.profile) saveProfile(data.profile);
      if (Array.isArray(data.history)) saveHistory(data.history);
      if (Array.isArray(data.chat)) saveChat(data.chat);
      if (data.dayTitles) saveDayTitles(data.dayTitles);

      alert("백업 데이터를 불러왔어요.");
      if (loadProfile()) {
        showMainScreen();
      } else {
        showOnboardingScreen();
      }
    };
    reader.readAsText(file);
  }

  // ---------- helpers ----------

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function sortByDateDesc(entries) {
    return [...entries].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return b.id - a.id;
    });
  }

  function isEntrySuccess(entry) {
    return entry.sets.every((reps) => reps >= entry.targetReps);
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---------- chat ----------

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inlineBold(s) {
    return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  // Minimal no-dependency markdown fallback (headings, bullet lists, **bold**),
  // used only if marked.js failed to load for some reason - so raw ### / ** / -
  // never leak into the UI even without the library.
  function fallbackMarkdown(text) {
    const lines = text.split("\n");
    let html = "";
    let inList = false;
    const closeList = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };
    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (headingMatch) {
        closeList();
        const level = Math.min(headingMatch[1].length + 2, 4);
        html += `<h${level}>${inlineBold(escapeHtml(headingMatch[2]))}</h${level}>`;
      } else if (bulletMatch) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${inlineBold(escapeHtml(bulletMatch[1]))}</li>`;
      } else if (line === "") {
        closeList();
      } else {
        closeList();
        html += `<p>${inlineBold(escapeHtml(line))}</p>`;
      }
    });
    closeList();
    return html;
  }

  function renderMarkdown(text) {
    if (window.marked) {
      try {
        return marked.parse(text);
      } catch (err) {
        // fall through to the lightweight fallback below
      }
    }
    return fallbackMarkdown(text);
  }

  function addChatBubble(role, text) {
    document.getElementById("chat-empty").classList.add("hidden");
    const list = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble-${role}`;
    if (role === "assistant") {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }
    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
    return bubble;
  }

  function renderChatHistory() {
    const chat = loadChat();
    const list = document.getElementById("chat-messages");
    list.innerHTML = "";
    if (chat.length === 0) {
      document.getElementById("chat-empty").classList.remove("hidden");
      return;
    }
    document.getElementById("chat-empty").classList.add("hidden");
    chat.forEach((m) => addChatBubble(m.role, m.content));
  }

  function setChatSending(isSending) {
    document.getElementById("chat-input").disabled = isSending;
    document.getElementById("chat-send-btn").disabled = isSending;
    document.getElementById("chat-send-btn").textContent = isSending ? "전송 중…" : "전송";
  }

  const CHAT_CONTEXT_DAYS = 14;

  function trimMessagesForApi(chat) {
    const cutoff = Date.now() - CHAT_CONTEXT_DAYS * 24 * 60 * 60 * 1000;
    return chat
      .filter((m) => !m.timestamp || m.timestamp >= cutoff)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function sendChatMessage(userText) {
    addChatBubble("user", userText);
    const chat = loadChat();
    chat.push({ role: "user", content: userText, timestamp: Date.now() });
    saveChat(chat);

    setChatSending(true);
    const thinkingBubble = addChatBubble("assistant", "생각 중…");

    try {
      const apiSettings = loadApiSettings();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: loadProfile(),
          history: loadHistory(),
          messages: trimMessagesForApi(chat),
          provider: apiSettings.provider,
          apiKey: apiSettings.apiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        thinkingBubble.textContent = data.error || "오류가 발생했어요. 잠시 후 다시 시도해주세요.";
        thinkingBubble.classList.add("chat-bubble-error");
        return;
      }

      thinkingBubble.innerHTML = renderMarkdown(data.reply);
      const updatedChat = loadChat();
      updatedChat.push({ role: "assistant", content: data.reply, timestamp: Date.now() });
      saveChat(updatedChat);
    } catch (err) {
      thinkingBubble.textContent = "서버에 연결할 수 없어요. server.py가 실행 중인지 확인해주세요.";
      thinkingBubble.classList.add("chat-bubble-error");
    } finally {
      setChatSending(false);
      document.getElementById("chat-messages").scrollTop = document.getElementById("chat-messages").scrollHeight;
    }
  }

  // ---------- rendering ----------

  function renderHistory() {
    const history = loadHistory();
    const dayTitles = loadDayTitles();
    const sorted = sortByDateDesc(history);
    const container = document.getElementById("history-list");
    const empty = document.getElementById("history-empty");
    container.innerHTML = "";

    if (sorted.length === 0) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const dates = [];
    const byDate = {};
    sorted.forEach((entry) => {
      if (!byDate[entry.date]) {
        byDate[entry.date] = [];
        dates.push(entry.date);
      }
      byDate[entry.date].push(entry);
    });

    dates.forEach((date) => {
      const title = dayTitles[date];
      const entries = byDate[date];

      const wrapper = document.createElement("div");
      wrapper.className = "history-day";

      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "history-day-compact";
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.innerHTML = `
        <span class="history-day-chevron"></span>
        <span class="history-day-date">${escapeHtml(date)}</span>
        <span class="history-day-title">${title ? escapeHtml(title) : "제목 없음"}</span>
        <span class="history-day-count">${entries.length}개 종목</span>
      `;

      const detailPanel = document.createElement("div");
      detailPanel.className = "history-day-detail hidden";
      detailPanel.innerHTML = entries
        .map((entry) => {
          const success = isEntrySuccess(entry);
          const setsChips = entry.sets
            .map((reps, i) => {
              const failClass = reps >= entry.targetReps ? "" : "detail-set-chip-fail";
              return `<span class="detail-set-chip ${failClass}">세트 ${i + 1}: ${reps}회</span>`;
            })
            .join("");
          return `
            <div class="detail-card">
              <div class="detail-card-header">
                <span class="detail-card-title">${escapeHtml(entry.exercise)}</span>
                <span class="detail-card-weight">${entry.weight}kg</span>
              </div>
              <div class="detail-card-meta">목표 ${entry.targetReps}회 · ${entry.sets.length}세트${success ? "" : " · 목표 미달"}</div>
              <div class="detail-sets">${setsChips}</div>
              <div class="detail-card-actions">
                <button type="button" class="btn btn-ghost btn-small detail-edit-btn" data-id="${entry.id}">수정</button>
                <button type="button" class="btn btn-ghost btn-small detail-delete-btn" data-id="${entry.id}">삭제</button>
              </div>
            </div>
          `;
        })
        .join("");

      detailPanel.querySelectorAll(".detail-edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const entry = entries.find((en) => en.id === Number(btn.dataset.id));
          if (entry) startEditEntry(entry);
        });
      });

      detailPanel.querySelectorAll(".detail-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!confirm("이 운동 기록을 삭제할까요?")) return;
          const history = loadHistory().filter((en) => en.id !== Number(btn.dataset.id));
          saveHistory(history);
          renderHistory();
        });
      });

      toggleBtn.addEventListener("click", () => {
        const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
        toggleBtn.setAttribute("aria-expanded", String(!isExpanded));
        detailPanel.classList.toggle("hidden", isExpanded);
      });

      wrapper.appendChild(toggleBtn);
      wrapper.appendChild(detailPanel);
      container.appendChild(wrapper);
    });
  }

  // ---------- screens ----------

  function showMainScreen() {
    document.getElementById("onboarding-screen").classList.add("hidden");
    document.getElementById("main-screen").classList.remove("hidden");
    renderChatHistory();
    renderHistory();
  }

  function showOnboardingScreen() {
    document.getElementById("main-screen").classList.add("hidden");
    document.getElementById("log-form-section").classList.add("hidden");
    document.getElementById("log-form-placeholder").classList.remove("hidden");
    document.getElementById("onboarding-screen").classList.remove("hidden");
    document.getElementById("onboarding-form").reset();
  }

  // ---------- 부위 -> 종목 selects ----------

  function populatePartSelect() {
    const select = document.getElementById("log-part");
    select.innerHTML = "";
    PART_ORDER.forEach((part) => {
      const opt = document.createElement("option");
      opt.value = part;
      opt.textContent = part;
      select.appendChild(opt);
    });
  }

  function populateExerciseSelectForPart(part) {
    const select = document.getElementById("log-exercise");
    select.innerHTML = "";
    (EXERCISE_PARTS[part] || []).forEach((ex) => {
      const opt = document.createElement("option");
      opt.value = ex;
      opt.textContent = ex;
      select.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_VALUE;
    customOpt.textContent = "직접 입력 (수영, 클라이밍 등)";
    select.appendChild(customOpt);

    toggleCustomExerciseInput(select.value === CUSTOM_VALUE);
  }

  function toggleCustomExerciseInput(show) {
    const row = document.getElementById("log-exercise-custom-row");
    const input = document.getElementById("log-exercise-custom");
    row.classList.toggle("hidden", !show);
    input.required = show;
    if (!show) input.value = "";
  }

  // ---------- set rows ----------

  function addSetRow() {
    const container = document.getElementById("sets-container");
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `
      <span></span>
      <input type="number" class="set-reps-input" min="0" step="1" placeholder="반복수" required />
      <button type="button" class="set-remove-btn" aria-label="세트 삭제">×</button>
    `;
    container.appendChild(row);
    row.querySelector(".set-remove-btn").addEventListener("click", () => {
      row.remove();
      renumberSets();
    });
    renumberSets();
  }

  function renumberSets() {
    const rows = document.querySelectorAll("#sets-container .set-row");
    rows.forEach((row, i) => {
      row.querySelector("span").textContent = `세트 ${i + 1}`;
    });
  }

  function resetLogForm() {
    editingEntryId = null;
    document.getElementById("log-form-heading").textContent = "운동 기록하기";
    document.getElementById("log-form").reset();
    const date = todayString();
    document.getElementById("log-date").value = date;
    document.getElementById("log-title").value = loadDayTitles()[date] || "";
    document.getElementById("log-part").value = PART_ORDER[0];
    populateExerciseSelectForPart(PART_ORDER[0]);
    document.getElementById("sets-container").innerHTML = "";
    addSetRow();
    addSetRow();
    addSetRow();
  }

  function startEditEntry(entry) {
    editingEntryId = entry.id;
    document.getElementById("log-form-heading").textContent = "운동 기록 수정하기";
    document.getElementById("log-form-placeholder").classList.add("hidden");
    document.getElementById("log-form-section").classList.remove("hidden");

    document.getElementById("log-date").value = entry.date;
    document.getElementById("log-title").value = loadDayTitles()[entry.date] || "";

    const part = findPartForExercise(entry.exercise);
    if (part) {
      document.getElementById("log-part").value = part;
      populateExerciseSelectForPart(part);
      document.getElementById("log-exercise").value = entry.exercise;
      toggleCustomExerciseInput(false);
    } else {
      const fallbackPart = PART_ORDER[PART_ORDER.length - 1];
      document.getElementById("log-part").value = fallbackPart;
      populateExerciseSelectForPart(fallbackPart);
      document.getElementById("log-exercise").value = CUSTOM_VALUE;
      toggleCustomExerciseInput(true);
      document.getElementById("log-exercise-custom").value = entry.exercise;
    }

    document.getElementById("log-weight").value = entry.weight;
    document.getElementById("log-target-reps").value = entry.targetReps;

    document.getElementById("sets-container").innerHTML = "";
    entry.sets.forEach(() => addSetRow());
    const repsInputs = document.querySelectorAll("#sets-container .set-reps-input");
    entry.sets.forEach((reps, i) => {
      repsInputs[i].value = reps;
    });

    document.getElementById("log-form-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- timer ----------

  // Total workout timer and the rest timer tick independently - starting the
  // total timer does not auto-start rest, and vice versa. Both share one
  // interval, kept alive as long as either is running.
  let timerRunning = false;
  let timerIntervalId = null;
  let timerStartedAt = 0;
  let timerElapsedMs = 0;
  let timerLapCount = 0;

  let restRunning = false;
  let restStartedAt = 0;

  function timerCurrentElapsedMs() {
    return timerElapsedMs + (timerRunning ? Date.now() - timerStartedAt : 0);
  }

  function restCurrentElapsedMs() {
    return restRunning ? Date.now() - restStartedAt : 0;
  }

  function ensureTicking() {
    if (!timerIntervalId) {
      timerIntervalId = setInterval(updateTimerDisplay, 250);
    }
  }

  function maybeStopTicking() {
    if (!timerRunning && !restRunning && timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  function updateTimerDisplay() {
    document.getElementById("timer-display").textContent = formatDuration(timerCurrentElapsedMs());
    document.getElementById("segment-timer-display").textContent = formatDuration(restCurrentElapsedMs());
  }

  function startPauseTimer() {
    const startBtn = document.getElementById("timer-start-btn");
    const lapBtn = document.getElementById("timer-lap-btn");
    if (!timerRunning) {
      timerRunning = true;
      timerStartedAt = Date.now();
      ensureTicking();
      startBtn.textContent = "일시정지";
      lapBtn.disabled = false;
    } else {
      timerRunning = false;
      timerElapsedMs = timerCurrentElapsedMs();
      maybeStopTicking();
      startBtn.textContent = "재개";
    }
  }

  function toggleRestTimer() {
    const lapBtn = document.getElementById("timer-lap-btn");
    if (!restRunning) {
      restRunning = true;
      restStartedAt = Date.now();
      ensureTicking();
      lapBtn.textContent = "쉬는 시간 기록";
    } else {
      const split = restCurrentElapsedMs();
      restRunning = false;
      timerLapCount += 1;

      const li = document.createElement("li");
      li.className = "timer-lap-item";
      li.innerHTML = `<span>쉬는 시간 ${timerLapCount}</span><span>${formatDuration(split)}</span>`;
      document.getElementById("timer-laps").prepend(li);

      lapBtn.textContent = "쉬는 시간 시작";
      maybeStopTicking();
      updateTimerDisplay(); // instant refresh so the rest display visibly resets to 00:00
    }
  }

  function resetTimer() {
    timerRunning = false;
    restRunning = false;
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    timerElapsedMs = 0;
    timerLapCount = 0;
    document.getElementById("timer-start-btn").textContent = "시작";
    document.getElementById("timer-lap-btn").textContent = "쉬는 시간 시작";
    document.getElementById("timer-lap-btn").disabled = true;
    document.getElementById("timer-laps").innerHTML = "";
    updateTimerDisplay();
  }

  // ---------- init ----------

  document.addEventListener("DOMContentLoaded", () => {
    populatePartSelect();
    updateTimerDisplay();

    document.getElementById("timer-start-btn").addEventListener("click", startPauseTimer);
    document.getElementById("timer-lap-btn").addEventListener("click", toggleRestTimer);
    document.getElementById("timer-reset-btn").addEventListener("click", resetTimer);

    const importFileInput = document.getElementById("import-file-input");
    document.getElementById("main-import-btn").addEventListener("click", () => importFileInput.click());
    document.getElementById("onboarding-import-btn").addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importDataFromFile(file);
      e.target.value = "";
    });

    document.getElementById("export-data-btn").addEventListener("click", exportData);

    document.getElementById("clear-chat-btn").addEventListener("click", () => {
      if (confirm("대화 내용을 초기화할까요? 운동 기록은 그대로 유지됩니다.")) {
        localStorage.removeItem(CHAT_KEY);
        renderChatHistory();
      }
    });

    const profile = loadProfile();
    if (profile) {
      showMainScreen();
    } else {
      showOnboardingScreen();
    }

    document.getElementById("onboarding-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const profile = {
        height: parseFloat(document.getElementById("ob-height").value),
        weight: parseFloat(document.getElementById("ob-weight").value),
        oneRM: {
          squat: parseFloat(document.getElementById("ob-squat").value),
          bench: parseFloat(document.getElementById("ob-bench").value),
          deadlift: parseFloat(document.getElementById("ob-deadlift").value),
        },
      };
      saveProfile(profile);
      showMainScreen();
    });

    document.getElementById("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("chat-input");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendChatMessage(text);
    });

    document.getElementById("open-log-form-btn").addEventListener("click", () => {
      resetLogForm();
      document.getElementById("log-form-placeholder").classList.add("hidden");
      document.getElementById("log-form-section").classList.remove("hidden");
    });

    document.getElementById("cancel-log-btn").addEventListener("click", () => {
      editingEntryId = null;
      document.getElementById("log-form-section").classList.add("hidden");
      document.getElementById("log-form-placeholder").classList.remove("hidden");
    });

    document.getElementById("log-date").addEventListener("change", (e) => {
      document.getElementById("log-title").value = loadDayTitles()[e.target.value] || "";
    });

    document.getElementById("log-part").addEventListener("change", (e) => {
      populateExerciseSelectForPart(e.target.value);
    });

    document.getElementById("log-exercise").addEventListener("change", (e) => {
      toggleCustomExerciseInput(e.target.value === CUSTOM_VALUE);
    });

    document.getElementById("add-set-btn").addEventListener("click", () => addSetRow());

    document.getElementById("log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const date = document.getElementById("log-date").value;
      const title = document.getElementById("log-title").value.trim();
      const exerciseSelectValue = document.getElementById("log-exercise").value;
      const exercise =
        exerciseSelectValue === CUSTOM_VALUE
          ? document.getElementById("log-exercise-custom").value.trim()
          : exerciseSelectValue;
      const weight = parseFloat(document.getElementById("log-weight").value);
      const targetReps = parseInt(document.getElementById("log-target-reps").value, 10);
      const setInputs = document.querySelectorAll("#sets-container .set-reps-input");
      const sets = Array.from(setInputs).map((input) => parseInt(input.value, 10));

      if (!exercise || sets.length === 0 || sets.some((n) => Number.isNaN(n))) {
        alert("운동 종목과 세트별 반복수를 모두 입력해주세요.");
        return;
      }

      const history = loadHistory();
      if (editingEntryId) {
        const idx = history.findIndex((en) => en.id === editingEntryId);
        if (idx !== -1) {
          history[idx] = { ...history[idx], date, exercise, weight, targetReps, sets };
        }
        editingEntryId = null;
      } else {
        history.push({ id: Date.now(), date, exercise, weight, targetReps, sets });
      }
      saveHistory(history);

      if (title) {
        const titles = loadDayTitles();
        titles[date] = title;
        saveDayTitles(titles);
      }

      document.getElementById("log-form-section").classList.add("hidden");
      document.getElementById("log-form-placeholder").classList.remove("hidden");
      renderHistory();
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
      if (confirm("모든 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) {
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(HISTORY_KEY);
        localStorage.removeItem(CHAT_KEY);
        localStorage.removeItem(DAY_TITLES_KEY);
        document.getElementById("profile-modal").classList.add("hidden");
        showOnboardingScreen();
      }
    });

    const profileModal = document.getElementById("profile-modal");

    document.getElementById("edit-profile-btn").addEventListener("click", () => {
      const profile = loadProfile();
      if (!profile) return;
      document.getElementById("pf-height").value = profile.height;
      document.getElementById("pf-weight").value = profile.weight;
      document.getElementById("pf-squat").value = profile.oneRM.squat;
      document.getElementById("pf-bench").value = profile.oneRM.bench;
      document.getElementById("pf-deadlift").value = profile.oneRM.deadlift;
      profileModal.classList.remove("hidden");
    });

    document.getElementById("profile-cancel-btn").addEventListener("click", () => {
      profileModal.classList.add("hidden");
    });

    profileModal.addEventListener("click", (e) => {
      if (e.target === profileModal) profileModal.classList.add("hidden");
    });

    document.getElementById("profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const profile = {
        height: parseFloat(document.getElementById("pf-height").value),
        weight: parseFloat(document.getElementById("pf-weight").value),
        oneRM: {
          squat: parseFloat(document.getElementById("pf-squat").value),
          bench: parseFloat(document.getElementById("pf-bench").value),
          deadlift: parseFloat(document.getElementById("pf-deadlift").value),
        },
      };
      saveProfile(profile);
      profileModal.classList.add("hidden");
    });

    const settingsModal = document.getElementById("settings-modal");

    document.getElementById("open-settings-btn").addEventListener("click", () => {
      const settings = loadApiSettings();
      document.getElementById("settings-provider").value = settings.provider;
      document.getElementById("settings-api-key").value = settings.apiKey;
      settingsModal.classList.remove("hidden");
    });

    document.getElementById("settings-cancel-btn").addEventListener("click", () => {
      settingsModal.classList.add("hidden");
    });

    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) settingsModal.classList.add("hidden");
    });

    document.getElementById("settings-form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveApiSettings({
        provider: document.getElementById("settings-provider").value,
        apiKey: document.getElementById("settings-api-key").value.trim(),
      });
      settingsModal.classList.add("hidden");
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // offline shell is a nice-to-have; ignore registration failures
      });
    });
  }
})();
