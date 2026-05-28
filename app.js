const STATUSES = {
  draft: { label: "資料準備中", badge: "badge-draft", role: "sales" },
  submitted: { label: "送交檢核中", badge: "badge-review", role: "risk" },
  returned: { label: "要求補件", badge: "badge-return", role: "sales" },
  approved: { label: "審核通過", badge: "badge-approved", role: "both" },
};

const DOC_CATEGORIES = {
  A: {
    label: "A 區 · 徵授信資料",
    items: [
      { id: "A1", name: "授信報核表", required: true },
      { id: "A2", name: "授信申請書", required: false },
    ],
  },
  B: {
    label: "B 區 · 查詢資料",
    items: [
      { id: "B1", name: "聯徵中心查詢結果", required: false },
      { id: "B2", name: "ismart 系統截圖/匯出檔", required: false },
    ],
  },
  C: {
    label: "C 區 · 基本資料",
    items: [
      { id: "C1", name: "401 表", required: true },
      { id: "C2", name: "營利事業登記證 / 執照", required: false },
      { id: "C3", name: "存摺明細", required: false },
    ],
  },
  D: {
    label: "D 區 · 其他資料",
    items: [
      { id: "D1", name: "負責人身分證影本", required: true },
      { id: "D2", name: "個資同意書", required: false },
    ],
  },
};

const LOAN_LABELS = {
  medical_equipment: "醫療設備貸款",
  working_capital: "營運週轉金",
  renovation: "裝潢改建貸款",
};

let currentRole = "sales";
let wizardStep = 0;
let wizardMode = "create";
let editingCaseId = null;
let cases = [];
let activeCaseId = null;
let searchKeyword = "";
let filterStatus = "all";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const loadCases = () => {
  try {
    const saved = localStorage.getItem("medicalLoanCases");
    cases = saved ? JSON.parse(saved) : [];
  } catch {
    cases = [];
  }
  if (cases.length === 0) {
    cases = [
      {
        id: "CASE-001",
        companyName: "台北仁愛醫療診所",
        taxId: "12345678",
        companyType: "clinic",
        companyAddress: "台北市大安區信義路四段100號",
        ownerName: "王小明",
        ownerId: "A123456789",
        ownerPhone: "0912-345-678",
        ownerEmail: "wang@example.com",
        loanProduct: "medical_equipment",
        loanAmount: 500,
        loanTerm: 36,
        loanPurpose: "購置超音波設備",
        status: "draft",
        returnReason: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documents: {},
      },
    ];
    saveCases();
  }
};

const saveCases = () => {
  localStorage.setItem("medicalLoanCases", JSON.stringify(cases));
};

const getCase = (id) => cases.find((c) => c.id === id);
const getAllDocItems = () => Object.values(DOC_CATEGORIES).flatMap((cat) => cat.items);
const getRequiredDocs = () => getAllDocItems().filter((d) => d.required);

const getMissingRequired = (caseData) => {
  const missing = [];
  if (!caseData.companyName) missing.push("企業名稱");
  if (!caseData.taxId) missing.push("統一編號");
  if (!caseData.ownerName) missing.push("負責人姓名");
  if (!caseData.loanAmount) missing.push("申請金額");
  getRequiredDocs().forEach((doc) => {
    if (!caseData.documents[doc.id]) missing.push(doc.name);
  });
  return missing;
};

const calcProgress = (caseData) => {
  const fields = ["companyName", "taxId", "ownerName", "ownerId", "loanAmount"];
  const fieldDone = fields.filter((f) => caseData[f]).length;
  const reqDocs = getRequiredDocs();
  const docDone = reqDocs.filter((d) => caseData.documents[d.id]).length;
  const total = fields.length + reqDocs.length;
  const done = fieldDone + docDone;
  return Math.round((done / total) * 100);
};

const getFilteredCases = () => {
  const keyword = searchKeyword.trim().toLowerCase();
  return cases.filter((c) => {
    const statusMatch = filterStatus === "all" || c.status === filterStatus;
    if (!statusMatch) return false;
    if (!keyword) return true;
    return c.id.toLowerCase().includes(keyword) || c.companyName.toLowerCase().includes(keyword);
  });
};

const renderDashboard = () => {
  const stats = document.getElementById("dashboardStats");
  const draft = cases.filter((c) => c.status === "draft").length;
  const submitted = cases.filter((c) => c.status === "submitted").length;
  const returned = cases.filter((c) => c.status === "returned").length;
  const approved = cases.filter((c) => c.status === "approved").length;
  stats.innerHTML = `
    <div class="metric-card"><p>資料準備中</p><strong>${draft}</strong></div>
    <div class="metric-card"><p>送交檢核中</p><strong>${submitted}</strong></div>
    <div class="metric-card"><p>要求補件</p><strong>${returned}</strong></div>
    <div class="metric-card"><p>審核通過</p><strong>${approved}</strong></div>
  `;
};

const renderKanban = () => {
  const board = document.getElementById("kanbanBoard");
  board.innerHTML = "";
  renderDashboard();
  const filteredCases = getFilteredCases();

  Object.entries(STATUSES).forEach(([key, meta]) => {
    const colCases = filteredCases.filter((c) => c.status === key);
    const col = document.createElement("div");
    col.className = "kanban-column";
    col.innerHTML = `
      <div class="kanban-column-header">
        <h2>${meta.label}</h2>
        <span class="kanban-count">${colCases.length}</span>
      </div>
    `;

    if (colCases.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "尚無案件";
      col.appendChild(empty);
    }

    colCases.forEach((c) => {
      const progress = calcProgress(c);
      const card = document.createElement("article");
      card.className = "case-card";
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `開啟案件 ${c.companyName}`);
      card.innerHTML = `
        <h3>${escapeHtml(c.companyName || "未命名案件")}</h3>
        <p class="meta">${c.id} · ${LOAN_LABELS[c.loanProduct] || c.loanProduct}</p>
        <div class="progress-mini" aria-hidden="true">
          <div class="progress-mini-fill" style="width:${progress}%"></div>
        </div>
        <span class="badge ${meta.badge}">${progress}% 完整</span>
      `;
      card.addEventListener("click", () => openDetail(c.id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(c.id);
        }
      });
      col.appendChild(card);
    });

    board.appendChild(col);
  });
};

const openWizard = () => {
  wizardMode = "create";
  editingCaseId = null;
  wizardStep = 0;
  document.getElementById("companyName").value = "";
  document.getElementById("taxId").value = "";
  document.getElementById("companyAddress").value = "";
  document.getElementById("ownerName").value = "";
  document.getElementById("ownerId").value = "";
  document.getElementById("ownerPhone").value = "";
  document.getElementById("ownerEmail").value = "";
  document.getElementById("loanAmount").value = "";
  document.getElementById("loanPurpose").value = "";
  updateWizardUI();
  document.getElementById("wizardOverlay").classList.add("open");
};

const closeWizard = () => {
  document.getElementById("wizardOverlay").classList.remove("open");
  wizardMode = "create";
  editingCaseId = null;
  document.getElementById("wizardNext").textContent = "下一步";
};

const updateWizardUI = () => {
  document.querySelectorAll(".wizard-step").forEach((el, i) => {
    el.classList.toggle("active", i === wizardStep);
    el.classList.toggle("done", i < wizardStep);
  });
  document.querySelectorAll(".wizard-panel").forEach((el) => {
    el.classList.toggle("hidden", Number(el.dataset.panel) !== wizardStep);
  });
  document.getElementById("wizardPrev").disabled = wizardStep === 0;
  if (wizardMode === "edit") {
    document.getElementById("wizardNext").textContent = wizardStep === 2 ? "儲存變更" : "下一步";
  } else {
    document.getElementById("wizardNext").textContent = wizardStep === 2 ? "建立案件" : "下一步";
  }
};

const validateWizardStep = () => {
  if (wizardStep === 0) {
    if (!document.getElementById("companyName").value.trim()) {
      alert("請填寫企業名稱");
      return false;
    }
    if (!/^\d{8}$/.test(document.getElementById("taxId").value.trim())) {
      alert("統一編號需為 8 位數字");
      return false;
    }
  }
  if (wizardStep === 1) {
    if (!document.getElementById("ownerName").value.trim()) {
      alert("請填寫負責人姓名");
      return false;
    }
    if (!/^[A-Z][12]\d{8}$/i.test(document.getElementById("ownerId").value.trim())) {
      alert("身分證字號格式不正確");
      return false;
    }
  }
  if (wizardStep === 2 && !document.getElementById("loanAmount").value) {
    alert("請填寫申請金額");
    return false;
  }
  return true;
};

const createCase = () => {
  const id = `CASE-${String(cases.length + 1).padStart(3, "0")}`;
  const newCase = {
    id,
    companyName: document.getElementById("companyName").value.trim(),
    taxId: document.getElementById("taxId").value.trim(),
    companyType: document.getElementById("companyType").value,
    companyAddress: document.getElementById("companyAddress").value.trim(),
    ownerName: document.getElementById("ownerName").value.trim(),
    ownerId: document.getElementById("ownerId").value.trim(),
    ownerPhone: document.getElementById("ownerPhone").value.trim(),
    ownerEmail: document.getElementById("ownerEmail").value.trim(),
    loanProduct: document.getElementById("loanProduct").value,
    loanAmount: Number(document.getElementById("loanAmount").value),
    loanTerm: Number(document.getElementById("loanTerm").value),
    loanPurpose: document.getElementById("loanPurpose").value.trim(),
    status: "draft",
    returnReason: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documents: {},
  };
  cases.push(newCase);
  saveCases();
  closeWizard();
  renderKanban();
  openDetail(id);
};

const updateCase = (caseId) => {
  const caseData = getCase(caseId);
  if (!caseData) return;
  caseData.companyName = document.getElementById("companyName").value.trim();
  caseData.taxId = document.getElementById("taxId").value.trim();
  caseData.companyType = document.getElementById("companyType").value;
  caseData.companyAddress = document.getElementById("companyAddress").value.trim();
  caseData.ownerName = document.getElementById("ownerName").value.trim();
  caseData.ownerId = document.getElementById("ownerId").value.trim();
  caseData.ownerPhone = document.getElementById("ownerPhone").value.trim();
  caseData.ownerEmail = document.getElementById("ownerEmail").value.trim();
  caseData.loanProduct = document.getElementById("loanProduct").value;
  caseData.loanAmount = Number(document.getElementById("loanAmount").value);
  caseData.loanTerm = Number(document.getElementById("loanTerm").value);
  caseData.loanPurpose = document.getElementById("loanPurpose").value.trim();
  caseData.updatedAt = new Date().toISOString();
  saveCases();
  closeWizard();
  renderKanban();
  openDetail(caseData.id);
};

const renderDocPanel = (caseData, categoryKey) => {
  const cat = DOC_CATEGORIES[categoryKey];
  return cat.items
    .map((item) => {
      const uploaded = caseData.documents[item.id];
      const statusHtml = uploaded
        ? `<span class="status-ok">✓ ${uploaded.name}</span>`
        : `<span class="status-missing">✗ 未上傳</span>`;

      return `
        <div class="doc-item ${item.required ? "required" : ""}" data-doc-id="${item.id}">
          <div class="doc-item-info">
            <h4>${item.id} · ${item.name}${item.required ? " *" : ""}</h4>
            <p>${item.required ? "必備文件" : "選填文件"}</p>
          </div>
          <div class="doc-status">
            ${statusHtml}
            ${
              currentRole === "sales" && caseData.status !== "approved"
                ? `
              <label class="btn btn-sm btn-outline" style="cursor:pointer">
                上傳
                <input type="file" class="hidden file-input" data-doc-id="${item.id}" aria-label="上傳 ${item.name}">
              </label>
            `
                : ""
            }
          </div>
        </div>
        ${
          currentRole === "sales" && caseData.status !== "approved"
            ? `
          <div class="drop-zone" data-drop-doc="${item.id}" tabindex="0" role="button" aria-label="拖曳上傳 ${item.name}">
            拖曳檔案至此，或點擊上方「上傳」按鈕
          </div>
        `
            : ""
        }
      `;
    })
    .join("");
};

const openDetail = (caseId) => {
  activeCaseId = caseId;
  const caseData = getCase(caseId);
  if (!caseData) return;

  const progress = calcProgress(caseData);
  const missing = getMissingRequired(caseData);
  const canSubmit = missing.length === 0 && caseData.status === "draft";
  const canSubmitReturn = caseData.status === "returned" && missing.length === 0;

  document.getElementById("detailTitle").textContent = `${caseData.companyName} (${caseData.id})`;
  const ctaText =
    missing.length > 0
      ? `尚缺：${missing.join("、")}，完成後即可送件`
      : "所有必備項目已完成，可以送交風管";

  document.getElementById("detailBody").innerHTML = `
    <div class="progress-section">
      <div class="progress-header">
        <span>資料完整度</span>
        <span>${progress}%</span>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar-fill" style="width:${progress}%"></div>
      </div>
      ${
        currentRole === "sales" && (caseData.status === "draft" || caseData.status === "returned")
          ? `<p class="cta-hint ${missing.length === 0 ? "ok" : ""}">${ctaText}</p>`
          : ""
      }
    </div>

    <div class="preview-box">
      <h3>動態表單預覽（變數自動帶入）</h3>
      <dl class="preview-grid">
        <dt>企業名稱</dt><dd>${escapeHtml(caseData.companyName)}</dd>
        <dt>統一編號</dt><dd>${escapeHtml(caseData.taxId)}</dd>
        <dt>負責人</dt><dd>${escapeHtml(caseData.ownerName)}</dd>
        <dt>貸款方案</dt><dd>${LOAN_LABELS[caseData.loanProduct]}</dd>
        <dt>申請金額</dt><dd>${caseData.loanAmount} 萬元 / ${caseData.loanTerm} 期</dd>
        <dt>資金用途</dt><dd>${escapeHtml(caseData.loanPurpose || "—")}</dd>
      </dl>
    </div>
    ${caseData.returnReason ? `<div class="preview-box"><h3>退件原因</h3><p>${escapeHtml(caseData.returnReason)}</p></div>` : ""}

    <h3 style="font-size:15px;margin-bottom:12px">文件集中歸檔</h3>
    <div class="doc-tabs" role="tablist">
      ${Object.keys(DOC_CATEGORIES)
        .map(
          (key, i) => `
        <button type="button" class="doc-tab ${i === 0 ? "active" : ""}" role="tab"
          data-tab="${key}" aria-selected="${i === 0}">${DOC_CATEGORIES[key].label}</button>
      `
        )
        .join("")}
    </div>
    ${Object.keys(DOC_CATEGORIES)
      .map(
        (key, i) => `
      <div class="doc-panel ${i === 0 ? "active" : ""}" data-panel="${key}" role="tabpanel">
        ${renderDocPanel(caseData, key)}
      </div>
    `
      )
      .join("")}
  `;

  bindDetailEvents(caseData);

  let footerHtml = '<button type="button" class="btn btn-outline" id="detailCloseBtn">關閉</button><div>';
  if (currentRole === "sales" && (caseData.status === "draft" || caseData.status === "returned")) {
    footerHtml += `
      <button type="button" class="btn btn-outline" id="btnEditCase">編輯資料</button>
      <button type="button" class="btn btn-primary" id="btnSubmit"
        ${canSubmit || canSubmitReturn ? "" : "disabled"}
        aria-disabled="${!(canSubmit || canSubmitReturn)}">
        送交風管
      </button>`;
  }
  if (currentRole === "risk" && caseData.status === "submitted") {
    footerHtml += `
      <button type="button" class="btn btn-warning btn-sm" id="btnReturn">要求補件</button>
      <button type="button" class="btn btn-success btn-sm" id="btnApprove">審核通過</button>`;
  }
  footerHtml += "</div>";
  document.getElementById("detailFooter").innerHTML = footerHtml;

  document.getElementById("detailCloseBtn")?.addEventListener("click", closeDetail);
  document.getElementById("btnEditCase")?.addEventListener("click", () => openEditCase(caseData.id));
  document.getElementById("btnSubmit")?.addEventListener("click", () => {
    caseData.status = "submitted";
    caseData.returnReason = "";
    caseData.updatedAt = new Date().toISOString();
    saveCases();
    closeDetail();
    renderKanban();
  });
  document.getElementById("btnReturn")?.addEventListener("click", () => {
    const reason = prompt("請輸入補件原因", "缺少必要文件，請補齊後重新送件");
    if (!reason) return;
    caseData.status = "returned";
    caseData.returnReason = reason.trim();
    caseData.updatedAt = new Date().toISOString();
    saveCases();
    closeDetail();
    renderKanban();
  });
  document.getElementById("btnApprove")?.addEventListener("click", () => {
    caseData.status = "approved";
    caseData.updatedAt = new Date().toISOString();
    saveCases();
    closeDetail();
    renderKanban();
  });

  document.getElementById("detailOverlay").classList.add("open");
};

const handleFileUpload = (caseData, docId, file) => {
  if (!file) return;
  caseData.documents[docId] = {
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  caseData.updatedAt = new Date().toISOString();
  saveCases();
  openDetail(caseData.id);
};

const openEditCase = (caseId) => {
  const caseData = getCase(caseId);
  if (!caseData) return;
  wizardMode = "edit";
  editingCaseId = caseData.id;
  document.getElementById("companyName").value = caseData.companyName;
  document.getElementById("taxId").value = caseData.taxId;
  document.getElementById("companyType").value = caseData.companyType;
  document.getElementById("companyAddress").value = caseData.companyAddress;
  document.getElementById("ownerName").value = caseData.ownerName;
  document.getElementById("ownerId").value = caseData.ownerId;
  document.getElementById("ownerPhone").value = caseData.ownerPhone;
  document.getElementById("ownerEmail").value = caseData.ownerEmail;
  document.getElementById("loanProduct").value = caseData.loanProduct;
  document.getElementById("loanAmount").value = caseData.loanAmount;
  document.getElementById("loanTerm").value = caseData.loanTerm;
  document.getElementById("loanPurpose").value = caseData.loanPurpose;
  wizardStep = 0;
  updateWizardUI();
  document.getElementById("wizardOverlay").classList.add("open");
};

const handleWizardNextClick = () => {
  if (!validateWizardStep()) return;
  if (wizardStep < 2) {
    wizardStep += 1;
    updateWizardUI();
  } else if (wizardMode === "edit" && editingCaseId) {
    updateCase(editingCaseId);
  } else {
    createCase();
  }
};

const bindDetailEvents = (caseData) => {
  document.querySelectorAll(".file-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      handleFileUpload(caseData, e.target.dataset.docId, e.target.files[0]);
    });
  });

  document.querySelectorAll(".drop-zone").forEach((zone) => {
    const docId = zone.dataset.dropDoc;
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      handleFileUpload(caseData, docId, file);
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const input = document.createElement("input");
        input.type = "file";
        input.onchange = () => handleFileUpload(caseData, docId, input.files[0]);
        input.click();
      }
    });
  });

  document.querySelectorAll(".doc-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      document.querySelectorAll(".doc-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === key);
        t.setAttribute("aria-selected", String(t.dataset.tab === key));
      });
      document.querySelectorAll(".doc-panel").forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === key);
      });
    });
  });
};

const closeDetail = () => {
  document.getElementById("detailOverlay").classList.remove("open");
  activeCaseId = null;
};

const setRole = (role) => {
  currentRole = role;
  document.getElementById("roleSales").classList.toggle("active", role === "sales");
  document.getElementById("roleRisk").classList.toggle("active", role === "risk");
  document.getElementById("roleSales").setAttribute("aria-pressed", String(role === "sales"));
  document.getElementById("roleRisk").setAttribute("aria-pressed", String(role === "risk"));
  document.getElementById("btnNewCase").classList.toggle("hidden", role !== "sales");
  renderKanban();
  if (activeCaseId) openDetail(activeCaseId);
};

document.getElementById("btnNewCase").addEventListener("click", openWizard);
document.getElementById("wizardClose").addEventListener("click", closeWizard);
document.getElementById("detailClose").addEventListener("click", closeDetail);
document.getElementById("roleSales").addEventListener("click", () => setRole("sales"));
document.getElementById("roleRisk").addEventListener("click", () => setRole("risk"));
document.getElementById("wizardPrev").addEventListener("click", () => {
  if (wizardStep > 0) {
    wizardStep -= 1;
    updateWizardUI();
  }
});
document.getElementById("wizardNext").addEventListener("click", handleWizardNextClick);
document.getElementById("searchKeyword").addEventListener("input", (e) => {
  searchKeyword = e.target.value;
  renderKanban();
});
document.getElementById("filterStatus").addEventListener("change", (e) => {
  filterStatus = e.target.value;
  renderKanban();
});
document.getElementById("btnExportJson").addEventListener("click", () => {
  downloadJson("medical-loan-cases.json", cases);
});
document.getElementById("wizardOverlay").addEventListener("click", (e) => {
  if (e.target.id === "wizardOverlay") closeWizard();
});
document.getElementById("detailOverlay").addEventListener("click", (e) => {
  if (e.target.id === "detailOverlay") closeDetail();
});

loadCases();
renderKanban();
