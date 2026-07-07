const DB_NAME = "beibei-food-store";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const DEFAULT_AVATAR = "assets/default-avatar.jpg";

const CATEGORIES = [
  { key: "homeCook", name: "家里做的" },
  { key: "outside", name: "外面吃的" },
  { key: "fastFood", name: "速食" },
  { key: "fruit", name: "水果" },
  { key: "drink", name: "饮品" }
];

const PLATFORMS = ["抖音", "小红书", "大众点评", "美团", "朋友推荐", "其他"];
const PLAN_STATUS = ["想去", "已安排", "已吃过", "暂不去"];
const PLAN_PRIORITY = ["普通", "想去", "必吃"];
const REMARKS = [
  { text: "夯爆了", tone: "pink" },
  { text: "顶级", tone: "amber" },
  { text: "NPC", tone: "blue" },
  { text: "拉完了", tone: "danger" }
];
const LEGACY_REMARK_TEXT = {
  "爆好吃": "夯爆了",
  "人上人": "顶级",
  "一般般": "NPC",
  "再接再厉": "NPC",
  "不合口味": "拉完了"
};

const defaultState = () => ({
  version: 1,
  settings: {
    shopName: "贝贝的小食铺",
    avatar: DEFAULT_AVATAR
  },
  foods: [],
  cart: [],
  plans: []
});

const app = {
  state: defaultState(),
  tab: "kitchen",
  category: "homeCook",
  search: "",
  planSearch: "",
  planStatus: "全部",
  importText: ""
};

const view = document.querySelector("#view");
const modal = document.querySelector("#modal");
const toastEl = document.querySelector("#toast");
const scrollHint = document.createElement("div");
const scrollHintBound = new WeakSet();
let scrollHintTimer = 0;

scrollHint.className = "scroll-follow-thumb";
document.body.appendChild(scrollHint);

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadState() {
  try {
    const saved = await dbGet("state");
    app.state = saved ? normalizeState(saved) : defaultState();
  } catch (error) {
    const fallback = localStorage.getItem("beibei-food-state");
    app.state = fallback ? normalizeState(JSON.parse(fallback)) : defaultState();
  }
}

async function saveState() {
  app.state.version = 1;
  try {
    await dbSet("state", app.state);
  } catch (error) {
    localStorage.setItem("beibei-food-state", JSON.stringify(app.state));
  }
}

function normalizeState(value) {
  const fresh = defaultState();
  const settings = { ...fresh.settings, ...(value.settings || {}) };
  settings.avatar = settings.avatar || DEFAULT_AVATAR;
  return {
    ...fresh,
    ...value,
    settings,
    foods: Array.isArray(value.foods) ? value.foods.map(food => ({ ...food, remark: normalizeRemark(food.remark) })) : [],
    cart: Array.isArray(value.cart) ? value.cart : [],
    plans: Array.isArray(value.plans) ? value.plans : []
  };
}

function normalizeRemark(remark) {
  if (!remark) return null;
  const rawText = String(remark?.text || remark || "").trim();
  if (!rawText) return null;
  const text = LEGACY_REMARK_TEXT[rawText] || rawText;
  const matched = REMARKS.find(item => item.text === text);
  return matched ? { ...matched } : { text, tone: remark?.tone || "pink" };
}

function normalizeBackupImport(value) {
  const data = value && typeof value === "object" ? value : {};
  const source = data.data && typeof data.data === "object" ? data.data : data;
  const foods = Array.isArray(source.foods) ? source.foods : Array.isArray(source.foodLib) ? source.foodLib : [];
  const plans = Array.isArray(source.plans) ? source.plans : Array.isArray(source.planMenu) ? source.planMenu : [];
  return {
    foods: foods.map(normalizeImportedFood).filter(isValidFood),
    plans: plans.map(normalizeImportedPlan).filter(isValidPlan)
  };
}

function normalizeImportedFood(item) {
  const rawId = String(item.mpId || item._id || item.id || id());
  const category = CATEGORIES.some(cat => cat.key === item.category) ? item.category : "homeCook";
  return {
    id: item.id ? String(item.id) : `mp-food-${rawId}`,
    mpId: rawId,
    name: String(item.name || "").trim(),
    desc: String(item.desc || "").trim(),
    price: Number(item.price || 0),
    recipe: String(item.recipe || "").trim(),
    image: getImportedImage(item),
    imageFileID: item.imageFileID || item.img || "",
    category,
    eatDate: String(item.eatDate || "").trim(),
    remark: item.remark && !item.remark.cancelled ? normalizeRemark(item.remark) : null,
    createdAt: String(item.createdAt || item.createTime || item._createTime || new Date().toISOString())
  };
}

function normalizeImportedPlan(item) {
  const rawId = String(item.mpId || item._id || item.id || id());
  return {
    id: item.id ? String(item.id) : `mp-plan-${rawId}`,
    mpId: rawId,
    restaurantName: String(item.restaurantName || item.name || "").trim(),
    location: String(item.location || "").trim(),
    avgPrice: String(item.avgPrice || "").trim(),
    recommendedDishes: String(item.recommendedDishes || "").trim(),
    platform: String(item.platform || "其他"),
    sourceLink: String(item.sourceLink || "").trim(),
    image: getImportedImage(item),
    imageFileID: item.imageFileID || item.img || "",
    reason: String(item.reason || "").trim(),
    planDate: String(item.planDate || "").trim(),
    status: String(item.status || "想去"),
    priority: String(item.priority || "想去"),
    notes: String(item.notes || "").trim(),
    createdAt: String(item.createdAt || item.createTime || item._createTime || new Date().toISOString())
  };
}

function getImportedImage(item) {
  const image = String(item.image || item.imgDataUrl || "");
  if (image.startsWith("data:image/")) return image;
  return "";
}

function isValidFood(food) {
  return Boolean(food.name && CATEGORIES.some(cat => cat.key === food.category) && Number.isFinite(Number(food.price)));
}

function isValidPlan(plan) {
  return Boolean(plan.restaurantName);
}

function mergeImportCollection(current, incoming, getKeys) {
  const result = current.map(item => ({ ...item }));
  const keyMap = new Map();
  result.forEach((item, index) => {
    getKeys(item).forEach(key => keyMap.set(key, index));
  });
  const stats = { added: 0, skipped: 0, enriched: 0 };

  incoming.forEach(item => {
    const duplicateIndex = getKeys(item).map(key => keyMap.get(key)).find(index => index !== undefined);
    if (duplicateIndex === undefined) {
      const nextIndex = result.push(item) - 1;
      getKeys(item).forEach(key => keyMap.set(key, nextIndex));
      stats.added += 1;
      return;
    }

    const merged = fillMissingFields(result[duplicateIndex], item);
    if (merged.changed) {
      result[duplicateIndex] = merged.item;
      getKeys(merged.item).forEach(key => keyMap.set(key, duplicateIndex));
      stats.enriched += 1;
    } else {
      stats.skipped += 1;
    }
  });

  return { items: result, stats };
}

function fillMissingFields(current, incoming) {
  let changed = false;
  const next = { ...current };
  Object.entries(incoming).forEach(([key, value]) => {
    if (key === "id" || key === "createdAt") return;
    const hasCurrentValue = next[key] !== undefined && next[key] !== null && next[key] !== "";
    const hasIncomingValue = value !== undefined && value !== null && value !== "";
    if (!hasCurrentValue && hasIncomingValue) {
      next[key] = value;
      changed = true;
    }
  });
  return { item: next, changed };
}

function foodImportKeys(food) {
  return [
    food.id && `id:${food.id}`,
    food.mpId && `mp:${food.mpId}`,
    food.name && `name:${food.name.trim().toLowerCase()}|${food.category}|${food.eatDate || ""}`
  ].filter(Boolean);
}

function planImportKeys(plan) {
  return [
    plan.id && `id:${plan.id}`,
    plan.mpId && `mp:${plan.mpId}`,
    plan.restaurantName && `name:${plan.restaurantName.trim().toLowerCase()}|${(plan.location || "").trim().toLowerCase()}|${plan.planDate || ""}`
  ].filter(Boolean);
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl(value) {
  return esc(value).replaceAll("\n", "<br>");
}

function getCategoryName(key) {
  return (CATEGORIES.find(item => item.key === key) || CATEGORIES[0]).name;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => toastEl.classList.add("hidden"), 1900);
}

function bindScrollHints(root = document) {
  const nodes = new Set([view]);
  if (root.querySelectorAll) {
    root.querySelectorAll(".right-food-list, .left-category, .sheet-body").forEach(node => nodes.add(node));
  }
  nodes.forEach(node => {
    if (!node || scrollHintBound.has(node)) return;
    scrollHintBound.add(node);
    node.addEventListener("scroll", () => showScrollHint(node), { passive: true });
  });
}

function showScrollHint(node) {
  if (!node || node.scrollHeight <= node.clientHeight + 4) return;
  const rect = node.getBoundingClientRect();
  const maxScroll = node.scrollHeight - node.clientHeight;
  const thumbHeight = Math.max(24, Math.min(42, rect.height * 0.18));
  const progress = maxScroll > 0 ? node.scrollTop / maxScroll : 0;
  const top = rect.top + (rect.height - thumbHeight) * progress;
  const left = rect.right - 7;

  scrollHint.style.height = `${thumbHeight}px`;
  scrollHint.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  scrollHint.classList.add("active");
  window.clearTimeout(scrollHintTimer);
  scrollHintTimer = window.setTimeout(() => scrollHint.classList.remove("active"), 520);
}

function imageHtml(src, label = "无图片") {
  return src
    ? `<img class="thumb" src="${src}" alt="${esc(label)}">`
    : `<div class="thumb">${esc(label)}</div>`;
}

function setActiveTab() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === app.tab);
  });
}

function render() {
  setActiveTab();
  if (app.tab === "kitchen") renderKitchen();
  if (app.tab === "order") renderOrder();
  if (app.tab === "plan") renderPlan();
  bindScrollHints(view);
}

function renderKitchen() {
  const { settings } = app.state;

  view.innerHTML = `
    <section class="page kitchen-page">
      <header class="top-header">
        ${settings.avatar ? `<img class="logo-avatar" src="${settings.avatar}" alt="头像" data-action="open-backup">` : `<button class="logo-avatar" data-action="open-backup">👧</button>`}
        <h1 class="title" aria-label="${esc(settings.shopName)}">
          <span class="title-marquee">
            <span>${esc(settings.shopName)}</span>
            <span aria-hidden="true">${esc(settings.shopName)}</span>
          </span>
        </h1>
        <div class="search-box">
          <input class="search-input" data-field="kitchen-search" placeholder="搜索菜品" value="${esc(app.search)}">
          <button class="search-refresh-btn" data-action="global-refresh" aria-label="刷新最新版本" title="刷新最新版本">↻</button>
        </div>
      </header>
      <div class="container">
        <aside class="left-category">
          ${CATEGORIES.map(cat => `<button class="category-item ${cat.key === app.category ? "active" : ""}" data-action="switch-category" data-category="${cat.key}"><span class="category-icon">${categoryIcon(cat.key)}</span><span>${cat.name}</span></button>`).join("")}
        </aside>
        <div class="right-food-list">
          ${kitchenFoodListHtml()}
        </div>
      </div>
      <button class="mid-add-btn" data-action="open-food-form" aria-label="添加菜品"><span class="plus">+</span></button>
    </section>
  `;
}

function filteredKitchenFoods() {
  return app.state.foods
    .filter(food => food.category === app.category)
    .filter(food => !app.search || [food.name, food.desc, food.recipe].some(text => String(text || "").toLowerCase().includes(app.search.toLowerCase())))
    .sort((a, b) => Math.abs(dateDistance(a.eatDate)) - Math.abs(dateDistance(b.eatDate)));
}

function kitchenFoodListHtml() {
  const filtered = filteredKitchenFoods();
  return filtered.map(foodCard).join("") || `<div class="empty-tip">${app.search ? "未找到匹配的菜品" : "该分类暂无菜品，点击底部中间加号添加菜品"}</div>`;
}

function refreshKitchenFoodList() {
  const list = document.querySelector(".right-food-list");
  if (list) list.innerHTML = kitchenFoodListHtml();
}

function foodCard(food) {
  const remark = food.remark ? foodRemarkTagHtml(food.remark) : "";
  return `
    <article class="card food-card" data-action="food-detail" data-id="${food.id}">
      ${remark}
      ${imageHtml(food.image, "菜品图")}
      <div class="food-info">
        <div class="food-name">${esc(food.name)}</div>
        <div class="food-alias">${esc(food.desc || getCategoryName(food.category))}</div>
        <div class="food-price">¥${money(food.price)}</div>
      </div>
      <button class="add-circle" data-action="add-cart" data-id="${food.id}" aria-label="加入菜单">+</button>
    </article>
  `;
}

function categoryIcon(key) {
  return {
    homeCook: '<img src="assets/icon-home-cook.png" alt="">',
    outside: '<img src="assets/icon-outside.png" alt="">',
    fastFood: '<img src="assets/icon-fast-food.png" alt="">',
    fruit: '<img src="assets/icon-fruit.png" alt="">',
    drink: '<img src="assets/icon-drink.png" alt="">'
  }[key] || "";
}

function renderOrder() {
  const items = app.state.cart
    .map(cartItem => ({ ...cartItem, food: app.state.foods.find(food => food.id === cartItem.foodId) }))
    .filter(item => item.food);
  const total = items.reduce((sum, item) => sum + Number(item.food.price || 0) * item.count, 0);

  view.innerHTML = `
    <section class="page page-wrap">
      <header class="page-head">
        <h1 class="page-title">本次菜单</h1>
      </header>
      <div class="summary-panel">
        <div class="summary-line"><span>菜品数量</span><strong>${items.reduce((sum, item) => sum + item.count, 0)}</strong></div>
        <div class="summary-line"><span>预估合计</span><span class="total">¥${money(total)}</span></div>
        ${items.length ? `<button class="danger-btn" data-action="clear-cart">清空菜单</button>` : ""}
      </div>
      <div class="grid">
        ${items.map(orderCard).join("") || `<div class="empty-tip">菜单为空，去厨房点击加号加购菜品</div>`}
      </div>
    </section>
  `;
}

function orderCard(item) {
  const food = item.food;
  return `
    <article class="card order-card">
      ${imageHtml(food.image, "菜品图")}
      <div class="food-info order-info">
        <div class="food-name">${esc(food.name)}</div>
        <div class="food-alias">${esc(getCategoryName(food.category))}</div>
        <div class="food-price">单价 ¥${money(food.price)}</div>
        <div class="subtotal">小计 ¥${money(Number(food.price || 0) * item.count)}</div>
        <div class="actions order-actions">
          <div class="count-control" aria-label="数量">
            <button data-action="sub-cart" data-id="${food.id}">-</button>
            <span>${item.count}</span>
            <button data-action="add-cart" data-id="${food.id}">+</button>
          </div>
          <button class="danger-btn" data-action="remove-cart" data-id="${food.id}">移除</button>
        </div>
      </div>
    </article>
  `;
}

function renderPlan() {
  const statuses = ["全部", ...PLAN_STATUS];
  const reminders = app.state.plans
    .filter(plan => {
      const distance = dateDistance(plan.planDate);
      return distance >= 0 && distance <= 7 && !["已吃过", "暂不去"].includes(plan.status);
    })
    .sort(comparePlan)
    .slice(0, 3);

  view.innerHTML = `
    <section class="page plan-page">
      <header class="page-head">
        <h1 class="page-title">想吃计划</h1>
      </header>
      <div class="plan-toolbar">
        <input class="search" data-field="plan-search" placeholder="搜索餐厅、地点、推荐菜" value="${esc(app.planSearch)}">
      </div>
      <div class="chip-row">
        ${statuses.map(status => `<button class="chip ${status === app.planStatus ? "active" : ""}" data-action="filter-plan" data-status="${status}">${status}</button>`).join("")}
      </div>
      ${reminders.length ? `<div class="reminder-panel">${reminders.map(reminderLine).join("")}</div>` : ""}
      <div class="grid plan-grid">
        ${planListHtml()}
      </div>
      <button class="plan-add-btn" data-action="open-plan-form" aria-label="添加计划">+</button>
    </section>
  `;
}

function filteredPlans() {
  return app.state.plans
    .filter(plan => app.planStatus === "全部" || plan.status === app.planStatus)
    .filter(plan => !app.planSearch || [plan.restaurantName, plan.location, plan.recommendedDishes, plan.reason, plan.notes].some(text => String(text || "").toLowerCase().includes(app.planSearch.toLowerCase())))
    .sort(comparePlan);
}

function planListHtml() {
  const list = filteredPlans();
  return list.map(planCard).join("") || `<div class="empty-tip">暂无计划菜单，记录一个想吃的地方吧</div>`;
}

function refreshPlanList() {
  const list = document.querySelector(".plan-grid");
  if (list) list.innerHTML = planListHtml();
}

function reminderLine(plan) {
  return `
    <button class="reminder-item" data-action="plan-detail" data-id="${plan.id}">
      <span class="reminder-date">${esc(reminderText(plan.planDate))}</span>
      <span class="reminder-name">${esc(plan.restaurantName)}</span>
      <span class="reminder-location">${esc(plan.location || "未填地点")}</span>
    </button>
  `;
}

function planCard(plan) {
  return `
    <article class="card plan-card" data-action="plan-detail" data-id="${plan.id}">
      ${imageHtml(plan.image, "计划图")}
      <div class="plan-card-main">
        <div class="plan-card-head">
          <div class="plan-title-wrap">
            <div class="plan-name">${esc(plan.restaurantName)}</div>
            <div class="plan-location">${esc(plan.location || "未填写地点")}</div>
          </div>
          <span class="priority-tag ${priorityTone(plan.priority)}">${esc(plan.priority || "想去")}</span>
        </div>
        <div class="plan-meta">
          <span>${esc(plan.platform || "其他平台")}</span>
          <span>${esc(plan.status || "想去")}</span>
          <span>${esc(plan.planDate || "待定")}</span>
        </div>
        ${plan.recommendedDishes ? `<div class="dish-line"><span class="label">推荐菜</span><span class="value">${esc(plan.recommendedDishes)}</span></div>` : ""}
        <div class="card-actions">
          <button class="plan-action-btn plan-secondary-btn" data-action="open-plan-form" data-id="${plan.id}">编辑</button>
          <button class="plan-action-btn plan-danger-btn" data-action="delete-plan" data-id="${plan.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function backupPanelHtml() {
  const backupData = createBackupPayload();
  const size = new Blob([JSON.stringify(backupData)]).size;
  return `
    <div class="backup-panel">
      <div class="backup-box">
        <div class="summary-line"><span>菜品</span><strong>${app.state.foods.length}</strong></div>
        <div class="summary-line"><span>想吃计划</span><strong>${app.state.plans.length}</strong></div>
        <div class="summary-line"><span>本地数据大小</span><strong>${Math.ceil(size / 1024)} KB</strong></div>
      </div>
      <div class="backup-actions">
        <button class="primary-btn backup-action-btn" data-action="export-data">导出全部</button>
        <label class="secondary-btn backup-action-btn file-import-label">
          导入备份
          <input class="file-input" type="file" accept="application/json,.json,.txt,text/plain" data-field="import-data">
        </label>
      </div>
      <div class="import-hint">导出会保存当前厨房菜品和计划页计划；导入会校验并合并，已存在的菜品和计划不会重复导入。</div>
      <div class="backup-box import-box">
        <label class="import-label">
          <span class="label">粘贴导入内容</span>
          <span class="import-hint">把导入内容.txt 里的全部文字粘贴到这里，可恢复菜品和计划；已存在的不会重复导入。</span>
          <textarea class="textarea import-textarea" placeholder="粘贴导入内容.txt 里的全部内容" data-field="import-text">${esc(app.importText)}</textarea>
        </label>
        <button class="secondary-btn" data-action="import-text">从粘贴内容导入</button>
      </div>
    </div>
  `;
}

function openBackupPanel() {
  openModal(sheet("备份与导入", backupPanelHtml()));
}

function priorityTone(priority) {
  if (priority === "必吃") return "pink";
  if (priority === "普通") return "blue";
  return "amber";
}

function dateDistance(dateText) {
  if (!dateText) return Number.POSITIVE_INFINITY;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function reminderText(dateText) {
  const distance = dateDistance(dateText);
  if (!Number.isFinite(distance)) return "待定";
  if (distance === 0) return "今天";
  if (distance === 1) return "明天";
  if (distance < 0) return "已过期";
  return `${distance}天后`;
}

function comparePlan(a, b) {
  const da = dateDistance(a.planDate);
  const db = dateDistance(b.planDate);
  if (da !== db) return da - db;
  const weight = { "必吃": 3, "想去": 2, "普通": 1 };
  return (weight[b.priority] || 2) - (weight[a.priority] || 2);
}

function openModal(html) {
  modal.innerHTML = html;
  modal.classList.remove("hidden");
  bindScrollHints(modal);
}

function closeModal() {
  modal.classList.add("hidden");
  modal.innerHTML = "";
  scrollHint.classList.remove("active");
}

function sheet(title, body) {
  return `
    <section class="sheet" role="dialog" aria-modal="true">
      <header class="sheet-head">
        <h2 class="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" data-action="close-modal" aria-label="关闭">关闭</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>
  `;
}

function openFoodForm(foodId = "") {
  const food = app.state.foods.find(item => item.id === foodId);
  const body = `
    <form class="form-grid" id="food-form">
      <label>
        <span class="label">菜品图片</span>
        <div class="image-preview" id="food-preview">${food?.image ? `<img src="${food.image}" alt="菜品图片">` : "选择一张照片"}</div>
        <input class="field" name="image" type="file" accept="image/*">
      </label>
      <label><span class="label">菜品名称 *</span><input class="field" name="name" maxlength="24" required value="${esc(food?.name || "")}"></label>
      <label><span class="label">简短描述</span><input class="field" name="desc" maxlength="40" value="${esc(food?.desc || "")}"></label>
      <div class="form-row">
        <label><span class="label">分类</span><select class="select" name="category">${CATEGORIES.map(cat => `<option value="${cat.key}" ${cat.key === (food?.category || app.category) ? "selected" : ""}>${cat.name}</option>`).join("")}</select></label>
        <label><span class="label">就餐日期 *</span><input class="field" name="eatDate" type="date" required value="${esc(food?.eatDate || today())}"></label>
      </div>
      <label><span class="label">价格 *</span><input class="field" name="price" type="number" min="0" max="9999" step="0.01" required value="${esc(food?.price ?? "")}"></label>
      <label><span class="label">做法 / 备注</span><textarea class="textarea" name="recipe" maxlength="500">${esc(food?.recipe || "")}</textarea></label>
      <button class="primary-btn" type="submit">${food ? "保存修改" : "添加菜品"}</button>
      ${food ? `<button class="danger-btn" type="button" data-action="delete-food" data-id="${food.id}">删除菜品</button>` : ""}
    </form>
  `;
  openModal(sheet(food ? "编辑菜品" : "新增菜品", body));
  bindImagePreview("#food-form input[name=image]", "#food-preview");
  document.querySelector("#food-form").addEventListener("submit", event => saveFoodForm(event, food));
}

async function saveFoodForm(event, oldFood) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("image");
  let image = oldFood?.image || "";
  if (file && file.size) image = await compressImage(file);
  if (!image) {
    toast("请先选择菜品图片");
    return;
  }
  const data = {
    id: oldFood?.id || id(),
    name: String(form.get("name")).trim(),
    desc: String(form.get("desc")).trim(),
    price: Number(form.get("price")),
    recipe: String(form.get("recipe")).trim(),
    image,
    category: String(form.get("category")),
    eatDate: String(form.get("eatDate")),
    remark: oldFood?.remark || null,
    createdAt: oldFood?.createdAt || new Date().toISOString()
  };
  if (!data.name || !Number.isFinite(data.price) || data.price < 0) {
    toast("菜品名称和价格需要填写正确");
    return;
  }
  if (oldFood) {
    app.state.foods = app.state.foods.map(food => food.id === oldFood.id ? data : food);
  } else {
    app.state.foods.push(data);
    app.category = data.category;
  }
  await saveState();
  closeModal();
  render();
  toast(oldFood ? "菜品已保存" : "菜品已添加");
}

function openFoodDetail(foodId) {
  const food = app.state.foods.find(item => item.id === foodId);
  if (!food) return;
  const body = `
    <div class="detail-stack">
      ${food.image ? `<img class="detail-img" src="${food.image}" alt="${esc(food.name)}">` : ""}
      <div class="detail-section">
        <div class="card-head">
          <div>
            <div class="name">${esc(food.name)}</div>
            <div class="meta">${esc(getCategoryName(food.category))} · ${esc(food.eatDate || "未填写日期")}</div>
          </div>
          <div class="price">¥${money(food.price)}</div>
        </div>
      </div>
      <div class="detail-section">${nl(food.recipe || food.desc || "暂无更多记录")}</div>
      <div class="remark-picker">${remarkOptionsHtml(food)}</div>
      <div class="actions">
        <button class="primary-btn" data-action="add-cart" data-id="${food.id}">加入菜单</button>
        <button class="secondary-btn" data-action="open-food-form" data-id="${food.id}">编辑</button>
        <button class="danger-btn" data-action="delete-food" data-id="${food.id}">删除</button>
        ${food.remark ? `<button class="secondary-btn" data-action="clear-remark" data-id="${food.id}">取消评价</button>` : ""}
      </div>
    </div>
  `;
  openModal(sheet("菜品详情", body));
}

function remarkOptionsHtml(food) {
  if (food.remark) {
    return remarkCardHtml(food.id, food.remark, true);
  }
  return `
    <button class="remark-add-btn" data-action="show-remark-options" data-id="${food.id}">
      <span class="remark-add-icon">+</span>
      <span>添加评价</span>
    </button>
  `;
}

function allRemarkCardsHtml(foodId) {
  return REMARKS.map(remark => remarkCardHtml(foodId, remark, false)).join("");
}

function remarkCardHtml(foodId, remark, active = false) {
  const config = getRemarkConfig(remark);
  return `
    <button class="remark-card ${config.tone} ${active ? "active" : ""}" data-action="set-remark" data-id="${foodId}" data-remark="${esc(config.text)}">
      <span class="remark-orb">${esc(config.icon)}</span>
      <span class="remark-text">${esc(config.text)}</span>
      ${active ? `<span class="remark-current">已选</span>` : ""}
    </button>
  `;
}

function foodRemarkTagHtml(remark) {
  const config = getRemarkConfig(remark);
  return `
    <div class="food-remark-tag ${config.tone}">
      <span class="remark-orb">${esc(config.icon)}</span>
      <span class="remark-text">${esc(config.text)}</span>
    </div>
  `;
}

function getRemarkConfig(remark) {
  const normalized = normalizeRemark(remark);
  const text = String(normalized?.text || "").trim();
  const matched = REMARKS.find(item => item.text === text);
  const icons = {
    "夯爆了": "夯",
    "顶级": "顶",
    "NPC": "N",
    "拉完了": "拉"
  };
  return {
    text,
    tone: matched?.tone || normalized?.tone || "pink",
    icon: icons[text] || text.slice(0, 1) || "评"
  };
}

function openDeleteFoodConfirm(foodId) {
  const food = app.state.foods.find(item => item.id === foodId);
  if (!food) return;
  const cartItem = app.state.cart.find(item => item.foodId === foodId);
  const cartText = cartItem ? `它也会从当前菜单中移除（当前 ${cartItem.count} 份）。` : "当前菜单里没有这道菜。";
  const body = `
    <div class="delete-confirm">
      ${food.image ? `<img class="delete-preview" src="${food.image}" alt="${esc(food.name)}">` : ""}
      <div>
        <div class="name">${esc(food.name)}</div>
        <p class="small">${esc(getCategoryName(food.category))} · ${esc(food.eatDate || "未填写日期")}</p>
      </div>
      <p class="import-hint">删除后会从本机菜品库移除，${cartText} 建议先在备份页导出一份最新备份。</p>
      <div class="actions">
        <button class="secondary-btn" data-action="close-modal">取消</button>
        <button class="danger-btn" data-action="confirm-delete-food" data-id="${food.id}">确认删除</button>
      </div>
    </div>
  `;
  openModal(sheet("删除菜品", body));
}

async function deleteFood(foodId) {
  const food = app.state.foods.find(item => item.id === foodId);
  if (!food) return;
  app.state.foods = app.state.foods.filter(item => item.id !== foodId);
  app.state.cart = app.state.cart.filter(item => item.foodId !== foodId);
  await saveState();
  closeModal();
  render();
  toast(`已删除「${food.name}」`);
}

function openPlanForm(planId = "") {
  const plan = app.state.plans.find(item => item.id === planId);
  const body = `
    <form class="form-grid" id="plan-form">
      <label>
        <span class="label">图片</span>
        <div class="image-preview" id="plan-preview">${plan?.image ? `<img src="${plan.image}" alt="计划图片">` : "可选：选择餐厅或截图照片"}</div>
        <input class="field" name="image" type="file" accept="image/*">
      </label>
      <label><span class="label">餐厅名称 *</span><input class="field" name="restaurantName" maxlength="30" required value="${esc(plan?.restaurantName || "")}"></label>
      <label><span class="label">地点位置</span><input class="field" name="location" maxlength="60" value="${esc(plan?.location || "")}"></label>
      <div class="form-row">
        <label><span class="label">大概价格</span><input class="field" name="avgPrice" value="${esc(plan?.avgPrice || "")}"></label>
        <label><span class="label">计划日期</span><input class="field" name="planDate" type="date" value="${esc(plan?.planDate || "")}"></label>
      </div>
      <label><span class="label">推荐菜</span><input class="field" name="recommendedDishes" maxlength="80" value="${esc(plan?.recommendedDishes || "")}"></label>
      <div class="form-row">
        <label><span class="label">平台</span><select class="select" name="platform">${PLATFORMS.map(item => `<option ${item === (plan?.platform || "抖音") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label><span class="label">状态</span><select class="select" name="status">${PLAN_STATUS.map(item => `<option ${item === (plan?.status || "想去") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      </div>
      <label><span class="label">想去程度</span><select class="select" name="priority">${PLAN_PRIORITY.map(item => `<option ${item === (plan?.priority || "想去") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      <label><span class="label">原分享链接</span><input class="field" name="sourceLink" type="url" value="${esc(plan?.sourceLink || "")}"></label>
      <label><span class="label">想吃原因</span><textarea class="textarea" name="reason" maxlength="200">${esc(plan?.reason || "")}</textarea></label>
      <label><span class="label">备注</span><textarea class="textarea" name="notes" maxlength="200">${esc(plan?.notes || "")}</textarea></label>
      <button class="primary-btn" type="submit">${plan ? "保存修改" : "添加计划"}</button>
    </form>
  `;
  openModal(sheet(plan ? "编辑计划" : "新增计划", body));
  bindImagePreview("#plan-form input[name=image]", "#plan-preview");
  document.querySelector("#plan-form").addEventListener("submit", event => savePlanForm(event, plan));
}

async function savePlanForm(event, oldPlan) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("image");
  let image = oldPlan?.image || "";
  if (file && file.size) image = await compressImage(file);
  const data = {
    id: oldPlan?.id || id(),
    restaurantName: String(form.get("restaurantName")).trim(),
    location: String(form.get("location")).trim(),
    avgPrice: String(form.get("avgPrice")).trim(),
    recommendedDishes: String(form.get("recommendedDishes")).trim(),
    platform: String(form.get("platform")),
    sourceLink: String(form.get("sourceLink")).trim(),
    image,
    reason: String(form.get("reason")).trim(),
    planDate: String(form.get("planDate")),
    status: String(form.get("status")),
    priority: String(form.get("priority")),
    notes: String(form.get("notes")).trim(),
    createdAt: oldPlan?.createdAt || new Date().toISOString()
  };
  if (!data.restaurantName) {
    toast("请填写餐厅名称");
    return;
  }
  if (oldPlan) {
    app.state.plans = app.state.plans.map(plan => plan.id === oldPlan.id ? data : plan);
  } else {
    app.state.plans.push(data);
  }
  await saveState();
  closeModal();
  render();
  toast(oldPlan ? "计划已保存" : "计划已添加");
}

function openPlanDetail(planId) {
  const plan = app.state.plans.find(item => item.id === planId);
  if (!plan) return;
  const link = plan.sourceLink ? `<a class="secondary-btn" href="${esc(plan.sourceLink)}" target="_blank" rel="noopener">打开链接</a>` : "";
  const body = `
    <div class="detail-stack">
      ${plan.image ? `<img class="detail-img" src="${plan.image}" alt="${esc(plan.restaurantName)}">` : ""}
      <div class="detail-section">
        <div class="card-head">
          <div>
            <div class="name">${esc(plan.restaurantName)}</div>
            <div class="meta">${esc(plan.location || "未填地点")}</div>
          </div>
          <span class="tag ${priorityTone(plan.priority)}">${esc(plan.priority || "想去")}</span>
        </div>
        <p class="small">${esc(plan.platform || "其他")} · ${esc(plan.status || "想去")} · ${esc(plan.planDate || "待定")}</p>
      </div>
      ${plan.recommendedDishes ? `<div class="detail-section"><strong>推荐菜</strong><br>${nl(plan.recommendedDishes)}</div>` : ""}
      ${plan.reason ? `<div class="detail-section"><strong>想吃原因</strong><br>${nl(plan.reason)}</div>` : ""}
      ${plan.notes ? `<div class="detail-section"><strong>备注</strong><br>${nl(plan.notes)}</div>` : ""}
      <div class="actions">
        ${link}
        <button class="primary-btn" data-action="open-plan-form" data-id="${plan.id}">编辑</button>
      </div>
    </div>
  `;
  openModal(sheet("计划详情", body));
}

function bindImagePreview(inputSelector, previewSelector) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    preview.innerHTML = `<img src="${dataUrl}" alt="预览">`;
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片读取失败"));
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addCart(foodId) {
  const item = app.state.cart.find(cartItem => cartItem.foodId === foodId);
  if (item) item.count += 1;
  else app.state.cart.push({ foodId, count: 1 });
}

async function globalRefresh() {
  toast("正在刷新最新版本...");
  try {
    const tasks = [];
    if ("serviceWorker" in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations()
          .then(registrations => Promise.all(registrations.map(registration => registration.update().catch(() => {}))))
      );
    }
    if ("caches" in window) {
      tasks.push(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))));
    }
    await Promise.all(tasks);
  } catch (error) {
    console.warn("刷新缓存失败，继续重新加载", error);
  } finally {
    window.setTimeout(() => window.location.reload(), 260);
  }
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const foodId = target.dataset.id;

  if (action === "close-modal") closeModal();
  if (action === "global-refresh") {
    await globalRefresh();
    return;
  }
  if (action === "switch-category") {
    app.category = target.dataset.category;
    app.search = "";
    render();
  }
  if (action === "open-food-form") openFoodForm(foodId);
  if (action === "food-detail") openFoodDetail(foodId);
  if (action === "add-cart") {
    addCart(foodId);
    await saveState();
    render();
    toast("已加入菜单");
  }
  if (action === "sub-cart") {
    const item = app.state.cart.find(cartItem => cartItem.foodId === foodId);
    if (item && item.count > 1) item.count -= 1;
    else app.state.cart = app.state.cart.filter(cartItem => cartItem.foodId !== foodId);
    await saveState();
    render();
  }
  if (action === "remove-cart") {
    app.state.cart = app.state.cart.filter(cartItem => cartItem.foodId !== foodId);
    await saveState();
    render();
  }
  if (action === "clear-cart" && confirm("确定清空本次菜单吗？")) {
    app.state.cart = [];
    await saveState();
    render();
  }
  if (action === "delete-food") {
    openDeleteFoodConfirm(foodId);
    return;
  }
  if (action === "confirm-delete-food") {
    await deleteFood(foodId);
    return;
  }
  if (action === "show-remark-options") {
    const picker = target.closest(".remark-picker");
    if (picker) picker.innerHTML = allRemarkCardsHtml(foodId);
    return;
  }
  if (action === "set-remark") {
    const remark = REMARKS.find(item => item.text === target.dataset.remark);
    app.state.foods = app.state.foods.map(food => food.id === foodId ? { ...food, remark } : food);
    await saveState();
    render();
    openFoodDetail(foodId);
    toast("评价已保存");
  }
  if (action === "clear-remark") {
    app.state.foods = app.state.foods.map(food => food.id === foodId ? { ...food, remark: null } : food);
    await saveState();
    render();
    openFoodDetail(foodId);
  }
  if (action === "filter-plan") {
    app.planStatus = target.dataset.status;
    render();
  }
  if (action === "open-plan-form") openPlanForm(foodId);
  if (action === "plan-detail") openPlanDetail(foodId);
  if (action === "delete-plan" && confirm("确定删除这条想吃计划吗？")) {
    app.state.plans = app.state.plans.filter(plan => plan.id !== foodId);
    await saveState();
    render();
  }
  if (action === "export-data") exportData();
  if (action === "import-text") importBackupText();
  if (action === "open-backup") openBackupPanel();
  if (action === "edit-shop") openShopForm();
}

function handleContextMenu(event) {
  if (event.target.closest("[data-action='switch-category']")) {
    event.preventDefault();
  }
}

function handleInput(event) {
  const field = event.target.dataset.field;
  if (field === "kitchen-search") {
    app.search = event.target.value.trim();
    refreshKitchenFoodList();
  }
  if (field === "plan-search") {
    app.planSearch = event.target.value.trim();
    refreshPlanList();
  }
  if (field === "import-text") {
    app.importText = event.target.value.trim();
  }
}

async function handleChange(event) {
  const field = event.target.dataset.field;
  if (field !== "import-data") return;
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    await importBackupData(parseImportText(text));
  } catch (error) {
    console.error("导入文件失败", error);
    toast("导入文件校验失败");
  } finally {
    event.target.value = "";
  }
}

async function importBackupText() {
  const input = document.querySelector('[data-field="import-text"]');
  const text = String((input && input.value) || app.importText || "").trim();
  if (!text) {
    toast("请先粘贴导入内容");
    return;
  }
  try {
    app.importText = text;
    await importBackupData(parseImportText(text));
  } catch (error) {
    console.error("粘贴内容导入失败", error);
    toast("粘贴内容读取失败，请确认复制了完整内容");
  }
}

function parseImportText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw error;
    return JSON.parse(text.slice(start, end + 1));
  }
}

async function importBackupData(parsed) {
  const imported = normalizeBackupImport(parsed);
  if (imported.foods.length === 0 && imported.plans.length === 0) {
    toast("没有识别到可导入的菜品或计划");
    return;
  }
  const foodMerge = mergeImportCollection(app.state.foods, imported.foods, foodImportKeys);
  const planMerge = mergeImportCollection(app.state.plans, imported.plans, planImportKeys);
  const totalNew = foodMerge.stats.added + planMerge.stats.added;
  const totalExisting = foodMerge.stats.skipped + foodMerge.stats.enriched + planMerge.stats.skipped + planMerge.stats.enriched;
  const message = `识别到 ${imported.foods.length} 个菜品、${imported.plans.length} 个计划。\n将新增 ${totalNew} 条，已存在 ${totalExisting} 条不会重复导入。\n继续导入吗？`;
  if (!confirm(message)) return;
  app.state.foods = foodMerge.items;
  app.state.plans = planMerge.items;
  await saveState();
  render();
  toast(`导入完成：新增 ${totalNew} 条`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(createBackupPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `beibei-food-backup-${today()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createBackupPayload() {
  return {
    app: "beibei-food-store",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      settings: app.state.settings,
      foods: app.state.foods,
      plans: app.state.plans
    }
  };
}

function openShopForm() {
  const { shopName, avatar } = app.state.settings;
  const body = `
    <form class="form-grid" id="shop-form">
      <label><span class="label">店铺名称</span><input class="field" name="shopName" maxlength="20" required value="${esc(shopName)}"></label>
      <label>
        <span class="label">头像</span>
        <div class="image-preview" id="shop-preview">${avatar ? `<img src="${avatar}" alt="头像">` : "可选：选择头像"}</div>
        <input class="field" name="avatar" type="file" accept="image/*">
      </label>
      <button class="primary-btn" type="submit">保存</button>
    </form>
  `;
  openModal(sheet("店铺设置", body));
  bindImagePreview("#shop-form input[name=avatar]", "#shop-preview");
  document.querySelector("#shop-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("avatar");
    let nextAvatar = avatar;
    if (file && file.size) nextAvatar = await compressImage(file);
    app.state.settings = {
      shopName: String(form.get("shopName")).trim() || "贝贝的小食铺",
      avatar: nextAvatar
    };
    await saveState();
    closeModal();
    render();
  });
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    app.tab = btn.dataset.tab;
    closeModal();
    render();
  });
});

document.addEventListener("click", handleClick);
document.addEventListener("contextmenu", handleContextMenu);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

async function start() {
  await loadState();
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

start();
