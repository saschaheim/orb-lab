/* Standalone Orb Lab scene: original assets stay on this GitHub Pages project. */
(async function(){
  "use strict";
  const scene=document.currentScript.dataset.scene;
  const labels={landing:"Landing",computing:"Computing",engineering:"Engineering",biology:"Biology",crypto:"Crypto",team:"Team"};
  if(!labels[scene])return;
  const page=location.pathname+location.search+location.hash;
  try{
    const response=await fetch("./blueyard-orbs.html",{cache:"no-store"});
    if(!response.ok)throw new Error("HTML HTTP "+response.status);
    let html=await response.text();
    html=html.replace("let chosen=\'landing\',lastTop=","let chosen=\'"+scene+"\',lastTop=");
    html=html.replace("const initial=new URL(location.href).searchParams.get(\'scene\');","const initial=\'"+scene+"\';");
    const css=`<style id="compact-orb-scene">
    html,body{background:#080a11!important;overflow:hidden!important;color:#e9eaf2!important}
    #orb-lab-chrome{display:none!important}
    #__nuxt>canvas{clip-path:circle(min(31vw,210px) at 50% 50%)!important;width:100vw!important;height:100dvh!important}
    #orb-scene-ui{position:fixed;inset:0;z-index:100002;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:32px 18px 34px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f3f2f8}
    #orb-scene-ui strong{font-size:12px;letter-spacing:.22em;text-transform:uppercase}
    #orb-scene-ui small{font-size:11px;color:#9a9fac}
    @media(max-width:600px){#__nuxt>canvas{clip-path:circle(min(38vw,185px) at 50% 50%)!important}}
    </style>`;
    const ui=`<div id="orb-scene-ui"><strong>ORB LAB · ${labels[scene]}</strong><small>Original WebGL scene · compact crop</small></div>`;
    html=html.replace("</head>",css+"</head>").replace("</body>",ui+"</body>");
    history.replaceState(history.state,"","/orb-lab/");
    document.open();document.write(html);document.close();
    window.addEventListener("load",()=>setTimeout(()=>history.replaceState(history.state,"",page),1800),{once:true});
  }catch(e){document.body.textContent="Orb konnte nicht geladen werden: "+e.message;}
})();