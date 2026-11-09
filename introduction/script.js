const diseaseContent = {
  leptospirosis: {
    name: "LEPTOSPIROSIS",
    transmission:
      "Contact with urine from infected animals or contaminated water, soil, and food.",
    description:
      "Severe illness can cause kidney or liver failure, meningitis, respiratory distress, and can be fatal without treatment.",
  },
  hantavirus: {
    name: "HANTAVIRUS",
    transmission:
      "Breathing contaminated dust or contacting urine, droppings, or saliva from infected rodents.",
    description:
      "Pulmonary syndrome can rapidly cause fluid in the lungs and breathing failure; other forms can cause bleeding and acute kidney failure.",
  },
  plague: {
    name: "PLAGUE",
    transmission:
      "Bites from infected fleas, contact with infected animal tissue, or inhaled infectious droplets.",
    description:
      "Septicaemic and pneumonic plague can progress rapidly and be fatal, but early antibiotic treatment is effective.",
  },
};

document.querySelectorAll('a[href="#home"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  });
});

const diseaseTabs = [...document.querySelectorAll(".disease-tab")];
const diseaseName = document.querySelector("#disease-name");
const diseaseDescription = document.querySelector("#disease-description");
const diseaseTransmission = document.querySelector("#disease-transmission");
const diseaseYear = document.querySelector("#disease-year");
const diseaseStatYear = document.querySelector("#disease-stat-year");
const diseaseStatValue = document.querySelector("#disease-stat-value");
const diseaseStatDelta = document.querySelector("#disease-stat-delta");
const diseaseTotal = document.querySelector("#disease-total");
const diseasePeak = document.querySelector("#disease-peak");
const diseaseChart = document.querySelector("#disease-chart");
let activeDisease = "leptospirosis";

function renderDiseaseChart(series, selectedYear, diseaseLabel) {
  const years = Object.keys(series).sort((a, b) => Number(a) - Number(b));
  const values = years.map((year) => Number(series[year]) || 0);
  const maximum = Math.max(...values);
  const yMaximum = maximum === 0 ? 1 : Math.ceil(maximum / 5) * 5;
  const width = 720;
  const height = 220;
  const margin = { top: 16, right: 14, bottom: 30, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const band = plotWidth / years.length;
  const barWidth = Math.max(5, band * 0.62);
  const tickYears = new Set(["2000", "2005", "2010", "2015", "2020", "2024"]);
  const yTicks = [...new Set([0, Math.round(yMaximum / 2), yMaximum])];

  const grid = yTicks
    .map((tick) => {
      const y = margin.top + plotHeight - (tick / yMaximum) * plotHeight;
      return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${
        width - margin.right
      }" y2="${y}"></line><text class="chart-axis-label" x="${
        margin.left - 7
      }" y="${y + 3}" text-anchor="end">${tick}</text>`;
    })
    .join("");

  const bars = years
    .map((year, index) => {
      const value = values[index];
      const x = margin.left + index * band + (band - barWidth) / 2;
      const barHeight = (value / yMaximum) * plotHeight;
      const y = margin.top + plotHeight - barHeight;
      const selectedClass = year === selectedYear ? " is-selected" : "";
      const yearLabel = tickYears.has(year)
        ? `<text class="chart-axis-label" x="${x + barWidth / 2}" y="${
            height - 9
          }" text-anchor="middle">${year}</text>`
        : "";
      return `<rect class="chart-bar${selectedClass}" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(
        barHeight,
        value === 0 ? 0 : 1,
      )}"><title>${year}: ${value} reported NYC ${
        value === 1 ? "case" : "cases"
      }</title></rect>${yearLabel}`;
    })
    .join("");

  const zeroState =
    maximum === 0
      ? `<line class="chart-zero-line" x1="${margin.left}" y1="${
          margin.top + plotHeight - 2
        }" x2="${width - margin.right}" y2="${
          margin.top + plotHeight - 2
        }"></line><text class="chart-zero-message" x="${width / 2}" y="${
          margin.top + plotHeight / 2
        }" text-anchor="middle">NO REPORTED NYC CASES, 2000–2024</text>`
      : "";

  diseaseChart.innerHTML = `<title id="disease-chart-svg-title">${diseaseLabel} annual NYC cases</title><desc id="disease-chart-svg-desc">Bar chart of reported New York City cases from 2000 through 2024. The selected year is ${selectedYear}.</desc>${grid}${bars}${zeroState}`;
}

function renderDisease() {
  const selected = diseaseContent[activeDisease];
  const year = diseaseYear.value;
  const series = window.RAT_CITY_DATA?.diseases?.[activeDisease] || {};
  const cases = series[year];
  const count = Number.isFinite(cases) ? cases : 0;
  const previousYear = String(Number(year) - 1);
  const previousCount = series[previousYear];
  const total = Object.values(series).reduce((sum, value) => sum + Number(value || 0), 0);
  const peakCount = Math.max(...Object.values(series).map((value) => Number(value || 0)));
  const peakYear = Object.keys(series)
    .sort((a, b) => Number(a) - Number(b))
    .find((item) => Number(series[item]) === peakCount);

  diseaseName.textContent = selected.name;
  diseaseStatYear.textContent = year;
  diseaseStatValue.textContent = count.toLocaleString("en-US");
  if (!Number.isFinite(previousCount)) {
    diseaseStatDelta.textContent = "FIRST YEAR IN SERIES";
  } else {
    const change = count - previousCount;
    diseaseStatDelta.textContent = `${change > 0 ? "+" : ""}${change} FROM ${previousYear}`;
  }
  diseaseTotal.textContent = `${total.toLocaleString("en-US")} TOTAL ${
    total === 1 ? "CASE" : "CASES"
  }`;
  diseasePeak.textContent =
    peakCount === 0 ? "NO CASES IN SERIES" : `PEAK: ${peakCount} IN ${peakYear}`;
  diseaseTransmission.textContent = selected.transmission;
  diseaseDescription.textContent = selected.description;
  renderDiseaseChart(series, year, selected.name);
}

diseaseTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeDisease = tab.dataset.disease;

    diseaseTabs.forEach((item) => {
      const isSelected = item === tab;
      item.classList.toggle("is-active", isSelected);
      item.setAttribute("aria-selected", String(isSelected));
    });

    renderDisease();
  });
});

diseaseYear.addEventListener("change", renderDisease);

const exploreMenu = document.querySelector(".explore-menu");
const exploreTrigger = document.querySelector(".explore-trigger");

exploreTrigger.addEventListener("click", () => {
  const isOpen = exploreMenu.classList.toggle("is-open");
  exploreTrigger.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (event) => {
  if (!exploreMenu.contains(event.target)) {
    exploreMenu.classList.remove("is-open");
    exploreTrigger.setAttribute("aria-expanded", "false");
  }
});

document.querySelectorAll(".explore-dropdown a").forEach((link) => {
  link.addEventListener("click", () => {
    exploreMenu.classList.remove("is-open");
    exploreTrigger.setAttribute("aria-expanded", "false");
  });
});

const metricYear = new Date().getFullYear();
const metricSummary = window.RAT_CITY_DATA?.summary || {};

const metrics = {
  complaints: {
    endpoint:
      `https://data.cityofnewyork.us/resource/erm2-nwe9.json?$select=count(*)%20AS%20total&$where=created_date%20%3E%3D%20%27${metricYear}-01-01T00%3A00%3A00.000%27%20AND%20complaint_type%3D%27Rodent%27`,
    label: `LIVE ${metricYear} / NYC OPEN DATA`,
    fallback: metricSummary.complaintsCurrentYearSnapshot,
    fallbackLabel: `VERIFIED ${metricYear} SNAPSHOT / NYC OPEN DATA`,
  },
  inspections: {
    endpoint:
      "https://data.cityofnewyork.us/resource/p937-wjvj.json?$select=count(*)%20AS%20total",
    label: "LIVE TOTAL / NYC OPEN DATA",
    fallback: metricSummary.inspectionsTotalSnapshot,
    fallbackLabel: "VERIFIED SNAPSHOT / NYC OPEN DATA",
  },
};

const formatNumber = new Intl.NumberFormat("en-US");

async function loadMetric(key, config) {
  const card = document.querySelector(`[data-metric="${key}"]`);
  const state = card.querySelector(".metric-state");
  const value = card.querySelector(".metric-value");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(config.endpoint, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);

    const data = await response.json();
    const total = Number(data?.[0]?.total);
    if (!Number.isFinite(total)) throw new Error("No total returned");

    state.textContent = config.label;
    value.textContent = formatNumber.format(total);
    card.removeAttribute("title");
  } catch (error) {
    const fallback = Number(config.fallback);
    if (Number.isFinite(fallback)) {
      state.textContent = config.fallbackLabel;
      value.textContent = formatNumber.format(fallback);
      card.title = "The live NYC Open Data request was unavailable. A verified downloaded snapshot is shown.";
    } else {
      state.textContent = "LIVE DATA UNAVAILABLE";
      value.textContent = "—";
      card.title = "The NYC Open Data service could not be reached. No estimate is shown.";
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function loadLiveMetrics() {
  Object.entries(metrics).forEach(([key, config]) => loadMetric(key, config));
}

function loadDownloadedMetrics() {
  const summary = window.RAT_CITY_DATA?.summary;
  const values = {
    outdoor: summary?.outdoorRatSightings,
    diseases: summary?.relatedDiseaseCases,
  };

  Object.entries(values).forEach(([key, total]) => {
    const value = document.querySelector(
      `[data-metric="${key}"] .metric-value`,
    );
    value.textContent = Number.isFinite(total) ? formatNumber.format(total) : "—";
  });
}

loadDownloadedMetrics();
renderDisease();
loadLiveMetrics();
window.setInterval(loadLiveMetrics, 5 * 60 * 1000);
