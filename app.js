(function () {
  "use strict";

  const PROFILE_KEY = "liftlog_profile";
  const HISTORY_KEY = "liftlog_history";
  const CHAT_KEY = "liftlog_chat";
  const DAY_TITLES_KEY = "liftlog_day_titles";
  const CUSTOM_EXERCISES_KEY = "liftlog_custom_exercises";
  const API_SETTINGS_KEY = "liftlog_api_settings";
  const ACTIVE_TAB_KEY = "liftlog_active_tab";
  const THEME_KEY = "liftlog_theme";

  const TABS = ["chat", "log", "timer", "settings"];

  // ---------- theme ----------

  // Applied immediately (not inside DOMContentLoaded) so the correct theme
  // is set before first paint - avoids a flash of the wrong theme.
  const THEME_COLORS = { light: "#F4F2FB", dark: "#000000" };

  function applyTheme(theme) {
    const resolved = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = `only ${resolved}`;

    const themeColorMeta = document.getElementById("theme-color-meta");
    if (themeColorMeta) themeColorMeta.setAttribute("content", THEME_COLORS[resolved]);

    // "only light"/"only dark" (vs. just "light"/"dark") is the strong form -
    // it tells mobile browsers this page is locked to one scheme right now,
    // so their forced-dark-mode heuristics leave it alone instead of trying
    // to "help" by re-darkening a page we deliberately set to light.
    const colorSchemeMeta = document.getElementById("color-scheme-meta");
    if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", `only ${resolved}`);
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  // ---------- add to home screen ----------

  // Only Chromium-based browsers fire this; captured as early as possible
  // (not inside DOMContentLoaded) since it can fire before that.
  let deferredInstallPrompt = null;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  let justInstalled = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    justInstalled = true;
  });

  async function handleInstallClick() {
    if (isStandalone || justInstalled) {
      alert("이미 홈 화면에 설치되어 있어요!");
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    if (isIOS) {
      alert(
        "iOS는 브라우저가 직접 설치 창을 띄워주지 않아요.\n\n" +
          "Safari 하단(또는 상단)의 공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택해주세요."
      );
      return;
    }
    // Android Chrome/Samsung Internet only fire beforeinstallprompt once
    // their own engagement heuristics are satisfied (repeat visits, time on
    // site, etc.), so it may never have fired yet even though the browser
    // fully supports installing - fall back to manual steps instead of
    // pretending it's unsupported.
    alert(
      "브라우저가 아직 설치 창을 자동으로 띄우지 않았어요.\n\n" +
        "오른쪽 위 메뉴(⋮)를 눌러 '앱 설치' 또는 '홈 화면에 추가'를 선택해주세요.\n" +
        "(삼성 인터넷은 메뉴 → '홈 화면에 추가')"
    );
  }

  // ---------- mascot ----------

  const MASCOTS = {
    main: "miyo-main.png", // 더드미요 - 앱의 메인 마스코트
    default: "miyo-default.png", // 미요
    teen: "miyo-teen.png", // 미요-X (사춘기형)
    god: "miyo-god.png", // 갓-미요
    sweat: "miyo-sweat.png", // 삐질미요
    pure: "miyo-pure.png", // 맑눈광미요
    blunt: "miyo-blunt.png", // 무뚝미요
    angry: "miyo-angry.png", // 빡미요
    advice: "miyo-advice.png", // 훈수미요
    asker: "miyo-asker.png", // 핑프미요
    rainbow: "miyo-rainbow.png", // 무지개미요
    parrot: "miyo-parrot.png", // 앵무미요
    why: "miyo-why.png", // 왜요미요
    smug: "miyo-smug.png", // 야르미요
    cheer: "miyo-cheer.png", // 갸루미요
  };

  function mascotSrc(mood) {
    return `assets/mascots/${MASCOTS[mood] || MASCOTS.main}`;
  }

  let mascotToastTimer = null;

  function showMascotToast(mood, message) {
    const toast = document.getElementById("mascot-toast");
    document.getElementById("mascot-toast-img").src = mascotSrc(mood);
    document.getElementById("mascot-toast-text").textContent = message;
    toast.classList.add("mascot-toast-visible");
    clearTimeout(mascotToastTimer);
    mascotToastTimer = setTimeout(() => {
      toast.classList.remove("mascot-toast-visible");
    }, 2500);
  }

  function showSaveFeedback(entryFields) {
    const success = isEntrySuccess(entryFields);
    if (success === true) {
      showMascotToast("god", "목표 세트 달성! 오늘도 완벽하네요.");
    } else if (success === false) {
      showMascotToast("sweat", "목표엔 살짝 못 미쳤지만 기록은 남았어요.");
    } else {
      showMascotToast("advice", "오늘 운동 기록 완료!");
    }
  }

  const CUSTOM_VALUE = "__custom__";

  const EXERCISE_PARTS = {
    "가슴": ["벤치프레스", "인클라인 프레스", "케이블 크로스오버", "딥스"],
    "등": ["데드리프트", "바벨로우", "랫풀다운", "시티드 케이블 로우", "원 암 덤벨 로우"],
    "하체": ["스쿼트", "핵스쿼트", "레그프레스", "워킹 런지", "레그컬", "레그익스텐션"],
    "어깨": ["오버헤드프레스", "덤벨 숄더 프레스", "사이드 레터럴 레이즈", "프론트 레이즈", "페이스풀", "리어 델트 플라이"],
    "팔": ["바벨 컬", "덤벨 해머 컬", "케이블 트라이셉스 푸쉬다운", "덤벨 라잉 트라이셉스 익스텐션"],
    "유산소·기타": ["러닝", "행잉 레그레이즈", "인클라인 런닝머신", "스텝밀"],
  };
  const PART_ORDER = Object.keys(EXERCISE_PARTS);

  const CARDIO_PART = "유산소·기타";
  const EXERCISE_TYPE_OVERRIDES = {
    "행잉 레그레이즈": { type: "reps_or_duration", defaultMode: "reps" },
    "인클라인 런닝머신": { type: "reps_or_duration", defaultMode: "duration" },
    "스텝밀": { type: "reps_or_duration", defaultMode: "duration" },
    "러닝": { type: "distance_time" },
  };

  function getExerciseType(part, exerciseName) {
    if (part !== CARDIO_PART) return { type: "strength" };
    return EXERCISE_TYPE_OVERRIDES[exerciseName] || { type: "reps_or_duration", defaultMode: "reps" };
  }

  let editingEntryId = null;
  let currentFieldState = { type: "strength", mode: null };

  function findPartForExercise(exercise) {
    return PART_ORDER.find((part) => getExercisesForPart(part).includes(exercise)) || null;
  }

  // ---------- storage ----------

  function loadProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  // A set used to be just the actual rep count, with one weight and one target
  // reps shared by the whole entry. Sets now carry their own weight and target
  // so a drop set or a warm-up set can be recorded as what it actually was.
  // Entries written before that change (in localStorage, or in a backup file
  // exported back then) are widened on read: every set inherits the old
  // entry-level weight/targetReps, which is exactly what it meant.
  function widenLegacyEntry(entry) {
    if (!entry || !Array.isArray(entry.sets)) return entry;
    if (!entry.sets.some((set) => typeof set !== "object" || set === null)) return entry;

    const entryWeight = entry.weight;
    const entryTargetReps = entry.targetReps;
    const widened = {
      ...entry,
      sets: entry.sets.map((set) => {
        if (set && typeof set === "object") return set;
        const next = { targetReps: entryTargetReps, reps: set };
        if (entry.type !== "reps_or_duration") next.weight = entryWeight;
        return next;
      }),
    };
    delete widened.weight;
    delete widened.targetReps;
    return widened;
  }

  function loadHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const history = stored.map(widenLegacyEntry);
    // widenLegacyEntry hands back the same object when there is nothing to do,
    // so this rewrites storage once and then never again.
    if (history.some((entry, i) => entry !== stored[i])) saveHistory(history);
    return history;
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

  // Exercises the user typed in via "직접 입력", kept per body part so they
  // show up as regular chips from then on instead of needing retyping.
  function loadCustomExercises() {
    const raw = localStorage.getItem(CUSTOM_EXERCISES_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  function saveCustomExercises(customExercises) {
    localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(customExercises));
  }

  function getExercisesForPart(part) {
    const builtIn = EXERCISE_PARTS[part] || [];
    const custom = loadCustomExercises()[part] || [];
    return [...builtIn, ...custom.filter((ex) => !builtIn.includes(ex))];
  }

  function addCustomExercise(part, exercise) {
    if (!part || !exercise || getExercisesForPart(part).includes(exercise)) return;
    const customExercises = loadCustomExercises();
    customExercises[part] = [...(customExercises[part] || []), exercise];
    saveCustomExercises(customExercises);
  }

  // Only user-typed exercises can be removed - the built-in list stays put.
  function isCustomExercise(part, exercise) {
    if ((EXERCISE_PARTS[part] || []).includes(exercise)) return false;
    return (loadCustomExercises()[part] || []).includes(exercise);
  }

  // Past entries keep the exercise as a plain string, so they survive this
  // untouched even though the name is gone from the pickable list.
  function removeCustomExercise(part, exercise) {
    const customExercises = loadCustomExercises();
    const remaining = (customExercises[part] || []).filter((ex) => ex !== exercise);
    if (remaining.length === (customExercises[part] || []).length) return;
    if (remaining.length) customExercises[part] = remaining;
    else delete customExercises[part];
    saveCustomExercises(customExercises);
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
      customExercises: loadCustomExercises(),
      exportedAt: new Date().toISOString(),
    };

    const apiSettings = loadApiSettings();
    if (apiSettings.apiKey) {
      const includeKey = confirm(
        "API 키도 백업 파일에 포함할까요?\n" +
          "iOS Safari는 오래 안 쓰면 저장된 키를 지우는 경우가 있어, 포함해두면 복원이 편해요.\n" +
          "단, 백업 파일에 키가 그대로 담기니 다른 사람과 공유하지 마세요."
      );
      if (includeKey) {
        data.apiSettings = apiSettings;
      }
    }

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

  // A backup file is arbitrary JSON from outside the app (possibly not even
  // from this app), but its fields end up unescaped in innerHTML (history
  // badges/meta) or run through the markdown renderer (chat). Coerce every
  // field to the exact shape the rest of the app produces itself, and drop
  // anything that doesn't fit, instead of trusting the file's shape.
  function sanitizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = Number(entry.id);
    const date = typeof entry.date === "string" ? entry.date : null;
    const exercise = typeof entry.exercise === "string" ? entry.exercise.trim() : "";
    if (!Number.isFinite(id) || !date || !exercise) return null;

    const type = entry.type === "distance_time" || entry.type === "reps_or_duration" ? entry.type : "strength";

    if (type === "distance_time") {
      const distanceKm = Number(entry.distanceKm);
      const durationMinutes = Number(entry.durationMinutes);
      if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes)) return null;
      return { id, date, exercise, type, distanceKm, durationMinutes };
    }

    if (type === "reps_or_duration" && entry.mode === "duration") {
      const durationMinutes = Number(entry.durationMinutes);
      if (!Number.isFinite(durationMinutes)) return null;
      return { id, date, exercise, type, mode: "duration", durationMinutes };
    }

    // Backup files exported before per-set weights carry sets as bare rep
    // counts; widen those first so only one shape is left to check.
    const widened = widenLegacyEntry({ ...entry, type });
    if (!Array.isArray(widened.sets) || widened.sets.length === 0) return null;

    const needsWeight = type === "strength";
    const sets = [];
    for (const raw of widened.sets) {
      if (!raw || typeof raw !== "object") return null;
      const targetReps = Number(raw.targetReps);
      const reps = Number(raw.reps);
      if (!Number.isFinite(targetReps) || !Number.isFinite(reps)) return null;
      if (!needsWeight) {
        sets.push({ targetReps, reps });
        continue;
      }
      const weight = Number(raw.weight);
      if (!Number.isFinite(weight)) return null;
      sets.push({ weight, targetReps, reps });
    }

    if (type === "strength") {
      return { id, date, exercise, type, sets };
    }
    return { id, date, exercise, type, mode: "reps", sets };
  }

  function sanitizeChatMessage(msg) {
    if (!msg || typeof msg !== "object") return null;
    if (msg.role !== "user" && msg.role !== "assistant") return null;
    if (typeof msg.content !== "string") return null;
    const timestamp = Number(msg.timestamp);
    return { role: msg.role, content: msg.content, timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() };
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
      if (Array.isArray(data.history)) {
        saveHistory(data.history.map(sanitizeHistoryEntry).filter(Boolean));
      }
      if (Array.isArray(data.chat)) {
        saveChat(data.chat.map(sanitizeChatMessage).filter(Boolean));
      }
      if (data.dayTitles) saveDayTitles(data.dayTitles);
      if (data.customExercises) saveCustomExercises(data.customExercises);
      if (data.apiSettings && data.apiSettings.apiKey) saveApiSettings(data.apiSettings);

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

  function hasRepsGoal(entry) {
    const type = entry.type || "strength";
    return type === "strength" || (type === "reps_or_duration" && entry.mode === "reps");
  }

  function isEntrySuccess(entry) {
    if (!hasRepsGoal(entry)) return null;
    return entry.sets.every((set) => Number(set.reps) >= Number(set.targetReps));
  }

  // Sets can now disagree, so a single number turns into a range when they do.
  function summarizeRange(values, unit) {
    const numbers = values.map(Number);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return min === max ? `${min}${unit}` : `${min}~${max}${unit}`;
  }

  function buildDetailCardBody(entry) {
    const type = entry.type || "strength";

    // These fields are numbers whenever an entry is created through the
    // form (parseFloat/parseInt), but a restored backup file could contain
    // anything - escape before they land in innerHTML below.
    const esc = (v) => escapeHtml(String(v));

    if (type === "distance_time") {
      return { badge: `${esc(entry.distanceKm)}km`, meta: `시간 ${esc(entry.durationMinutes)}분`, setsHtml: "" };
    }

    if (type === "reps_or_duration" && entry.mode === "duration") {
      return { badge: `${esc(entry.durationMinutes)}분`, meta: "운동 시간 기록", setsHtml: "" };
    }

    const success = isEntrySuccess(entry);
    const setsHtml = entry.sets
      .map((set, i) => {
        const failClass = Number(set.reps) >= Number(set.targetReps) ? "" : "detail-set-chip-fail";
        const weightPart = type === "strength" ? `${esc(set.weight)}kg · ` : "";
        return `<span class="detail-set-chip ${failClass}">세트 ${i + 1}: ${weightPart}${esc(set.reps)}/${esc(set.targetReps)}회</span>`;
      })
      .join("");
    const failSuffix = success ? "" : " · 목표 미달";
    const targets = entry.sets.map((set) => set.targetReps);
    const sameTarget = targets.every((t) => Number(t) === Number(targets[0]));
    const badge =
      type === "strength"
        ? esc(summarizeRange(entry.sets.map((set) => set.weight), "kg"))
        : `${esc(summarizeRange(targets, "회"))} 목표`;
    const setCountText = `${entry.sets.length}세트${failSuffix}`;
    const meta =
      type === "strength" && sameTarget ? `목표 ${esc(targets[0])}회 · ${setCountText}` : setCountText;
    return { badge, meta, setsHtml };
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

  // marked.js passes literal HTML in its source straight through - by
  // design, it doesn't sanitize. Since assistant replies are rendered via
  // innerHTML (for real markdown formatting) and that text can come from an
  // AI response or, via backup import, an arbitrary JSON file, a literal
  // <img onerror=...> in the source would otherwise execute. No markdown
  // syntax (**, #, -, backticks, etc.) needs angle brackets, so stripping
  // tag-shaped runs here is safe and invisible to normal formatting.
  function stripRawHtmlTags(text) {
    return text.replace(/<\/?[a-zA-Z!][^>]*>/g, "");
  }

  function renderMarkdown(text) {
    const safeText = stripRawHtmlTags(text);
    if (window.marked) {
      try {
        return marked.parse(safeText);
      } catch (err) {
        // fall through to the lightweight fallback below
      }
    }
    return fallbackMarkdown(safeText);
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

    if (role === "assistant") {
      const row = document.createElement("div");
      row.className = "chat-row";
      const avatar = document.createElement("img");
      avatar.className = "chat-avatar";
      // The trainer is 더드미요 and nobody else - the other 미요 faces stay
      // in the toasts, where they read as reactions rather than as a
      // different character answering.
      avatar.src = mascotSrc("main");
      avatar.alt = "";
      row.appendChild(avatar);
      row.appendChild(bubble);
      list.appendChild(row);
    } else {
      list.appendChild(bubble);
    }

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
          const { badge, meta, setsHtml } = buildDetailCardBody(entry);
          return `
            <div class="detail-card">
              <div class="detail-card-header">
                <span class="detail-card-title">${escapeHtml(entry.exercise)}</span>
                <span class="detail-card-weight">${badge}</span>
              </div>
              <div class="detail-card-meta">${meta}</div>
              <div class="detail-sets">${setsHtml}</div>
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

  // The tabs are purely a mobile affordance - on desktop every section stays
  // visible and the CSS ignores data-active-tab entirely.
  function setActiveTab(tab) {
    if (!TABS.includes(tab)) tab = "chat";
    document.body.dataset.activeTab = tab;
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
    document.querySelectorAll(".bottom-nav-btn[data-tab-target]").forEach((btn) => {
      btn.setAttribute("aria-current", btn.dataset.tabTarget === tab ? "page" : "false");
    });
    window.scrollTo(0, 0);
  }

  function showMainScreen() {
    document.getElementById("onboarding-screen").classList.add("hidden");
    document.getElementById("main-screen").classList.remove("hidden");
    document.body.classList.add("main-active");
    setActiveTab(localStorage.getItem(ACTIVE_TAB_KEY) || "chat");
    renderChatHistory();
    renderHistory();
  }

  function showOnboardingScreen() {
    document.body.classList.remove("main-active");
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
    renderPartChips();
  }

  function populateExerciseSelectForPart(part) {
    const select = document.getElementById("log-exercise");
    select.innerHTML = "";
    getExercisesForPart(part).forEach((ex) => {
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
    updateFormFieldsForExercise(part, select.value);
    renderExerciseChips(part);
  }

  function renderPartChips() {
    const select = document.getElementById("log-part");
    const container = document.getElementById("log-part-chips");
    container.innerHTML = "";
    PART_ORDER.forEach((part) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (select.value === part ? " active" : "");
      btn.textContent = part;
      btn.addEventListener("click", () => {
        if (select.value === part) return;
        select.value = part;
        select.dispatchEvent(new Event("change"));
        renderPartChips();
      });
      container.appendChild(btn);
    });
  }

  function renderExerciseChips(part) {
    const select = document.getElementById("log-exercise");
    const container = document.getElementById("log-exercise-chips");
    container.innerHTML = "";
    const items = [...getExercisesForPart(part).map((ex) => ({ value: ex, label: ex })), { value: CUSTOM_VALUE, label: "직접 입력" }];
    items.forEach(({ value, label }) => {
      const active = select.value === value;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (active ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        if (select.value === value) return;
        select.value = value;
        select.dispatchEvent(new Event("change"));
        renderExerciseChips(part);
      });

      // A mistyped exercise would otherwise stay in the list forever, so the
      // ones the user added carry their own delete button. Nesting it inside
      // the chip button would be invalid HTML - they sit side by side and are
      // styled as one pill instead.
      if (value !== CUSTOM_VALUE && isCustomExercise(part, value)) {
        const group = document.createElement("span");
        group.className = "chip-deletable" + (active ? " active" : "");
        group.appendChild(btn);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "chip-delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute("aria-label", `${label} 종목 삭제`);
        deleteBtn.addEventListener("click", () => {
          if (!confirm(`'${label}'을(를) 종목 목록에서 삭제할까요?\n이미 저장된 운동 기록은 그대로 남아요.`)) return;
          removeCustomExercise(part, value);
          // Repopulating resets the select to its first option, which is what
          // we want whenever the deleted exercise was the selected one.
          populateExerciseSelectForPart(part);
        });
        group.appendChild(deleteBtn);
        container.appendChild(group);
        return;
      }

      container.appendChild(btn);
    });
  }

  function toggleCustomExerciseInput(show) {
    const row = document.getElementById("log-exercise-custom-row");
    const input = document.getElementById("log-exercise-custom");
    row.classList.toggle("hidden", !show);
    input.required = show;
    if (!show) input.value = "";
  }

  // ---------- weight / reps / duration / distance fields ----------

  function applyFieldVisibility(type, mode) {
    const resolvedMode = type === "reps_or_duration" ? mode || "reps" : null;

    const showWeight = type === "strength";
    const showRepsFields = type === "strength" || (type === "reps_or_duration" && resolvedMode === "reps");
    const showDurationField = (type === "reps_or_duration" && resolvedMode === "duration") || type === "distance_time";
    const showDistance = type === "distance_time";
    const showModeToggle = type === "reps_or_duration";

    document.getElementById("log-weight-row").classList.toggle("hidden", !showWeight);
    document.getElementById("log-weight").required = showWeight;

    document.getElementById("log-target-reps-row").classList.toggle("hidden", !showRepsFields);
    document.getElementById("log-target-reps").required = showRepsFields;
    document.getElementById("log-sets-row").classList.toggle("hidden", !showRepsFields);

    document.getElementById("log-duration-row").classList.toggle("hidden", !showDurationField);
    document.getElementById("log-duration-minutes").required = showDurationField;

    document.getElementById("log-distance-row").classList.toggle("hidden", !showDistance);
    document.getElementById("log-distance-km").required = showDistance;

    document.getElementById("log-mode-toggle-row").classList.toggle("hidden", !showModeToggle);
    if (showModeToggle) {
      document.querySelectorAll("#log-mode-toggle .mode-toggle-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === resolvedMode);
      });
    }

    currentFieldState = { type, mode: resolvedMode };
    // Whether a set shows a weight depends on the type that was just applied.
    renderSetRows();
    return currentFieldState;
  }

  function updateFormFieldsForExercise(part, exerciseName, mode) {
    const info = getExerciseType(part, exerciseName);
    const resolvedMode = info.type === "reps_or_duration" ? mode || info.defaultMode || "reps" : null;
    return applyFieldVisibility(info.type, resolvedMode);
  }

  // ---------- set rows ----------

  // The sets being edited live here rather than in the DOM, because a set now
  // holds three values that are edited in a modal instead of typed in place.
  //
  // weight/targetReps are either a number or null, and null means "follow the
  // default field at the top of the form". A set only pins its own number when
  // the modal was given something different from that default - so raising the
  // default weight still moves every set the user did not single out, while a
  // 50kg drop set stays at 50kg.
  let logSets = [];
  let editingSetIndex = null;

  function readSetDefaults() {
    return {
      weight: parseFloat(document.getElementById("log-weight").value),
      targetReps: parseInt(document.getElementById("log-target-reps").value, 10),
    };
  }

  function resolveSet(set) {
    const defaults = readSetDefaults();
    return {
      weight: set.weight === null ? defaults.weight : set.weight,
      targetReps: set.targetReps === null ? defaults.targetReps : set.targetReps,
      reps: set.reps,
    };
  }

  // Actual reps are always per set, so a row that has none yet still shows the
  // weight and target it inherited - otherwise the default fields would look
  // like they had no effect.
  function setSummaryText(set) {
    const { weight, targetReps, reps } = resolveSet(set);
    const needsWeight = currentFieldState.type === "strength";
    if (!Number.isFinite(targetReps) || (needsWeight && !Number.isFinite(weight))) return "입력하기";

    const weightPart = needsWeight ? `${weight}kg · ` : "";
    if (!Number.isFinite(reps)) return `${weightPart}목표 ${targetReps}회 · 횟수 입력`;
    return `${weightPart}${reps}/${targetReps}회`;
  }

  function renderSetRows() {
    const container = document.getElementById("sets-container");
    if (!container) return;
    container.innerHTML = "";

    logSets.forEach((set, i) => {
      const resolved = resolveSet(set);
      const filled = Number.isFinite(resolved.reps) && Number.isFinite(resolved.targetReps);

      const row = document.createElement("div");
      row.className = "set-row";

      const label = document.createElement("span");
      label.textContent = `세트 ${i + 1}`;
      row.appendChild(label);

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "set-open-btn";
      if (filled && resolved.reps < resolved.targetReps) openBtn.classList.add("set-open-btn-fail");
      openBtn.textContent = setSummaryText(set);
      openBtn.setAttribute("aria-label", `세트 ${i + 1} 입력`);
      openBtn.addEventListener("click", () => openSetModal(i));
      row.appendChild(openBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "set-remove-btn";
      removeBtn.setAttribute("aria-label", `세트 ${i + 1} 삭제`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        logSets.splice(i, 1);
        renderSetRows();
      });
      row.appendChild(removeBtn);

      container.appendChild(row);
    });
  }

  function addSet() {
    logSets.push({ weight: null, targetReps: null, reps: null });
    renderSetRows();
  }

  // ---------- set modal ----------

  function openSetModal(index) {
    const set = logSets[index];
    if (!set) return;
    editingSetIndex = index;

    const showWeight = currentFieldState.type === "strength";
    const resolved = resolveSet(set);

    document.getElementById("set-modal-heading").textContent = `세트 ${index + 1}`;
    document.getElementById("set-modal-weight-row").classList.toggle("hidden", !showWeight);

    const weightInput = document.getElementById("set-modal-weight");
    weightInput.required = showWeight;
    weightInput.value = showWeight && Number.isFinite(resolved.weight) ? resolved.weight : "";

    const targetInput = document.getElementById("set-modal-target");
    targetInput.value = Number.isFinite(resolved.targetReps) ? resolved.targetReps : "";

    const repsInput = document.getElementById("set-modal-reps");
    repsInput.value = Number.isFinite(resolved.reps) ? resolved.reps : "";

    document
      .getElementById("set-modal-next-btn")
      .classList.toggle("hidden", index >= logSets.length - 1);

    document.getElementById("set-modal").classList.remove("hidden");
    (showWeight ? weightInput : targetInput).focus();
  }

  function closeSetModal() {
    editingSetIndex = null;
    document.getElementById("set-modal").classList.add("hidden");
  }

  function commitSetModal() {
    if (!logSets[editingSetIndex]) return;
    const defaults = readSetDefaults();
    const showWeight = currentFieldState.type === "strength";

    const weight = parseFloat(document.getElementById("set-modal-weight").value);
    const targetReps = parseInt(document.getElementById("set-modal-target").value, 10);
    const reps = parseInt(document.getElementById("set-modal-reps").value, 10);

    // Matching the default is stored as null, so later default edits keep
    // flowing through to this set.
    logSets[editingSetIndex] = {
      weight: !showWeight || weight === defaults.weight ? null : weight,
      targetReps: targetReps === defaults.targetReps ? null : targetReps,
      reps: Number.isFinite(reps) ? reps : null,
    };
    renderSetRows();
  }

  function resetLogForm() {
    editingEntryId = null;
    document.getElementById("log-form-heading").textContent = "운동 기록하기";
    document.getElementById("log-form").reset();
    const date = todayString();
    document.getElementById("log-date").value = date;
    document.getElementById("log-title").value = loadDayTitles()[date] || "";
    document.getElementById("log-part").value = PART_ORDER[0];
    renderPartChips();
    populateExerciseSelectForPart(PART_ORDER[0]);
    logSets = [];
    addSet();
    addSet();
    addSet();
  }

  function startEditEntry(entry) {
    editingEntryId = entry.id;
    setActiveTab("log");
    document.getElementById("log-form-heading").textContent = "운동 기록 수정하기";
    document.getElementById("log-form-placeholder").classList.add("hidden");
    document.getElementById("log-form-section").classList.remove("hidden");

    document.getElementById("log-date").value = entry.date;
    document.getElementById("log-title").value = loadDayTitles()[entry.date] || "";

    const part = findPartForExercise(entry.exercise);
    if (part) {
      document.getElementById("log-part").value = part;
      renderPartChips();
      populateExerciseSelectForPart(part);
      document.getElementById("log-exercise").value = entry.exercise;
      renderExerciseChips(part);
      toggleCustomExerciseInput(false);
    } else {
      const fallbackPart = PART_ORDER[PART_ORDER.length - 1];
      document.getElementById("log-part").value = fallbackPart;
      renderPartChips();
      populateExerciseSelectForPart(fallbackPart);
      document.getElementById("log-exercise").value = CUSTOM_VALUE;
      renderExerciseChips(fallbackPart);
      toggleCustomExerciseInput(true);
      document.getElementById("log-exercise-custom").value = entry.exercise;
    }

    const entryType = entry.type || "strength";
    applyFieldVisibility(entryType, entry.mode);

    logSets = [];

    if (entryType === "distance_time") {
      document.getElementById("log-distance-km").value = entry.distanceKm;
      document.getElementById("log-duration-minutes").value = entry.durationMinutes;
    } else if (entryType === "reps_or_duration" && entry.mode === "duration") {
      document.getElementById("log-duration-minutes").value = entry.durationMinutes;
    } else {
      // The first set seeds the default fields; sets that agree with it are
      // stored as null so they keep tracking those defaults while editing.
      const first = entry.sets[0] || {};
      if (entryType === "strength") {
        document.getElementById("log-weight").value = first.weight;
      }
      document.getElementById("log-target-reps").value = first.targetReps;
      const defaults = readSetDefaults();
      logSets = entry.sets.map((set) => ({
        weight: entryType === "strength" && Number(set.weight) !== defaults.weight ? Number(set.weight) : null,
        targetReps: Number(set.targetReps) !== defaults.targetReps ? Number(set.targetReps) : null,
        reps: Number(set.reps),
      }));
    }
    renderSetRows();

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
    // the timer lives in its own tab, so surface "still running" on the nav
    document
      .getElementById("nav-timer-btn")
      .classList.toggle("timer-active", timerRunning || restRunning);
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

    // Best-effort: ask the browser not to evict localStorage under storage
    // pressure or Safari's inactivity cap. Not universally honored on iOS,
    // but harmless to request and helps in some iOS/PWA combinations.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Always visible (per user request) rather than gated on
    // beforeinstallprompt firing - Android's engagement heuristics for that
    // event are unreliable, so most visitors would otherwise never see it.
    // handleInstallClick() falls back to manual instructions, or a "already
    // installed" message, when there's nothing to prompt.
    document.getElementById("install-app-btn").addEventListener("click", handleInstallClick);

    document.querySelectorAll("#theme-toggle .mode-toggle-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeChoice === document.documentElement.dataset.theme);
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.themeChoice);
        localStorage.setItem(THEME_KEY, btn.dataset.themeChoice);
        document.querySelectorAll("#theme-toggle .mode-toggle-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    document.querySelectorAll(".bottom-nav-btn[data-tab-target]").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tabTarget));
    });

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
      setActiveTab("log");
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
      const part = document.getElementById("log-part").value;
      updateFormFieldsForExercise(part, e.target.value);
    });

    document.getElementById("log-mode-toggle").addEventListener("click", (e) => {
      const btn = e.target.closest(".mode-toggle-btn");
      if (!btn) return;
      applyFieldVisibility("reps_or_duration", btn.dataset.mode);
    });

    document.getElementById("add-set-btn").addEventListener("click", () => addSet());

    // Sets that follow the defaults have to redraw as the defaults are typed.
    document.getElementById("log-weight").addEventListener("input", renderSetRows);
    document.getElementById("log-target-reps").addEventListener("input", renderSetRows);

    const setModal = document.getElementById("set-modal");
    const setForm = document.getElementById("set-form");

    document.getElementById("set-modal-cancel-btn").addEventListener("click", closeSetModal);

    setModal.addEventListener("click", (e) => {
      if (e.target === setModal) closeSetModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !setModal.classList.contains("hidden")) closeSetModal();
    });

    setForm.addEventListener("submit", (e) => {
      e.preventDefault();
      commitSetModal();
      closeSetModal();
    });

    // Kept as a plain button with an explicit validity check: relying on
    // submitter/requestSubmit would cut out older iOS Safari.
    document.getElementById("set-modal-next-btn").addEventListener("click", () => {
      if (!setForm.reportValidity()) return;
      const nextIndex = editingSetIndex + 1;
      commitSetModal();
      if (nextIndex < logSets.length) openSetModal(nextIndex);
      else closeSetModal();
    });

    document.getElementById("log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const date = document.getElementById("log-date").value;
      const title = document.getElementById("log-title").value.trim();
      const part = document.getElementById("log-part").value;
      const exerciseSelectValue = document.getElementById("log-exercise").value;
      const exercise =
        exerciseSelectValue === CUSTOM_VALUE
          ? document.getElementById("log-exercise-custom").value.trim()
          : exerciseSelectValue;

      if (exerciseSelectValue === CUSTOM_VALUE && exercise) {
        addCustomExercise(part, exercise);
      }

      const { type, mode } = currentFieldState;
      let entryFields = null;

      if (type === "distance_time") {
        const distanceKm = parseFloat(document.getElementById("log-distance-km").value);
        const durationMinutes = parseFloat(document.getElementById("log-duration-minutes").value);
        if (!exercise || Number.isNaN(distanceKm) || Number.isNaN(durationMinutes)) {
          alert("운동 종목과 달린 거리, 시간을 모두 입력해주세요.");
          return;
        }
        entryFields = { type, distanceKm, durationMinutes };
      } else if (type === "reps_or_duration" && mode === "duration") {
        const durationMinutes = parseFloat(document.getElementById("log-duration-minutes").value);
        if (!exercise || Number.isNaN(durationMinutes)) {
          alert("운동 종목과 운동 시간을 입력해주세요.");
          return;
        }
        entryFields = { type, mode, durationMinutes };
      } else {
        const needsWeight = type === "strength";
        const sets = logSets.map((set) => {
          const { weight, targetReps, reps } = resolveSet(set);
          return needsWeight ? { weight, targetReps, reps } : { targetReps, reps };
        });

        const incomplete = sets.some(
          (set) =>
            !Number.isFinite(set.reps) ||
            !Number.isFinite(set.targetReps) ||
            (needsWeight && !Number.isFinite(set.weight))
        );

        if (!exercise || sets.length === 0 || incomplete) {
          alert("운동 종목과 세트별 무게, 목표 횟수, 실제 횟수를 모두 입력해주세요.");
          return;
        }

        entryFields = needsWeight ? { type, sets } : { type, mode, sets };
      }

      const history = loadHistory();
      if (editingEntryId) {
        const idx = history.findIndex((en) => en.id === editingEntryId);
        if (idx !== -1) {
          history[idx] = { id: history[idx].id, date, exercise, ...entryFields };
        }
        editingEntryId = null;
      } else {
        history.push({ id: Date.now(), date, exercise, ...entryFields });
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
      showSaveFeedback(entryFields);
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
      if (confirm("모든 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) {
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(HISTORY_KEY);
        localStorage.removeItem(CHAT_KEY);
        localStorage.removeItem(DAY_TITLES_KEY);
        localStorage.removeItem(CUSTOM_EXERCISES_KEY);
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
