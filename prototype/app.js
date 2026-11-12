(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("club-form");
  const setup = $("setup-view");
  const dashboard = $("dashboard-view");
  let crestData = "";

  const updateColour = (inputId, labelId) => {
    const value = $(inputId).value.toUpperCase();
    $(labelId).textContent = value;
    return value;
  };
  $("club-colour").addEventListener("input", () => updateColour("club-colour", "colour-value"));
  $("club-secondary").addEventListener("input", () => updateColour("club-secondary", "secondary-value"));

  $("club-name").addEventListener("input", (event) => {
    const words = event.target.value.trim().split(/\s+/).filter(Boolean);
    $("club-short").value = words.map(word => word[0]).join("").slice(0, 5).toUpperCase();
    $("crest-initials").textContent = $("club-short").value || "ZFK";
  });
  $("club-short").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    $("crest-initials").textContent = event.target.value || "ZFK";
  });

  $("crest-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return alert("Choose a PNG, JPG or WEBP image.");
    if (file.size > 2 * 1024 * 1024) return alert("Please choose an image smaller than 2 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      crestData = String(reader.result || "");
      $("crest-preview").innerHTML = '<img alt="Club crest preview">';
      $("crest-preview").querySelector("img").src = crestData;
    };
    reader.readAsDataURL(file);
  });

  function showDashboard(club) {
    $("dashboard-name").textContent = club.name;
    $("dashboard-short").textContent = club.shortName;
    $("dashboard-initials").textContent = club.shortName;
    $("dashboard-crest").style.background = club.primary;
    if (club.crest) {
      $("dashboard-crest").innerHTML = '<img alt="Club crest">';
      $("dashboard-crest").querySelector("img").src = club.crest;
    } else {
      $("dashboard-crest").innerHTML = '<span></span>';
      $("dashboard-crest").querySelector("span").textContent = club.shortName;
      $("dashboard-crest").style.background = `linear-gradient(150deg,${club.primary},#0e3c2a)`;
    }
    document.documentElement.style.setProperty("--accent", club.primary);
    setup.hidden = true;
    dashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const club = {
      name: $("club-name").value.trim(),
      shortName: $("club-short").value.trim().toUpperCase(),
      primary: updateColour("club-colour", "colour-value"),
      secondary: updateColour("club-secondary", "secondary-value"),
      crest: crestData
    };
    if (!club.name || !club.shortName) return;
    try { localStorage.setItem("zfk_management_demo_club", JSON.stringify(club)); }
    catch { alert("This image is too large for local browser storage. Try a smaller crest."); return; }
    showDashboard(club);
  });

  $("edit-club").addEventListener("click", () => {
    const saved = JSON.parse(localStorage.getItem("zfk_management_demo_club") || "null");
    if (!saved) return;
    $("club-name").value = saved.name;
    $("club-short").value = saved.shortName;
    $("club-colour").value = saved.primary;
    $("club-secondary").value = saved.secondary;
    $("colour-value").textContent = saved.primary;
    $("secondary-value").textContent = saved.secondary;
    crestData = saved.crest || "";
    if (crestData) {
      $("crest-preview").innerHTML = '<img alt="Club crest preview">';
      $("crest-preview").querySelector("img").src = crestData;
    } else {
      $("crest-preview").innerHTML = '<span id="crest-initials"></span>';
      $("crest-initials").textContent = saved.shortName;
    }
    dashboard.hidden = true;
    setup.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("reset-demo").addEventListener("click", () => {
    localStorage.removeItem("zfk_management_demo_club");
    location.reload();
  });

  try {
    const saved = JSON.parse(localStorage.getItem("zfk_management_demo_club") || "null");
    if (saved && saved.name) showDashboard(saved);
  } catch { /* Invalid local demo data: start with a blank club form. */ }
})();