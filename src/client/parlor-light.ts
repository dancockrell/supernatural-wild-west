/** Architectural light registered to the 1672 x 941 room, below actors and UI. */
export function createParlorLight(): SVGSVGElement {
  const light=document.createElementNS('http://www.w3.org/2000/svg','svg');
  light.classList.add('parlor-light'); light.setAttribute('viewBox','0 0 1672 941');
  light.setAttribute('aria-hidden','true');
  light.innerHTML=`<defs>
    <filter id="window-inset"><feMorphology operator="erode" radius="10"/><feGaussianBlur stdDeviation="2"/></filter><filter id="capital-feather"><feGaussianBlur stdDeviation="5"/></filter><filter id="floor-perimeter"><feGaussianBlur stdDeviation="6"/></filter><mask id="light-openings"><path fill="white" filter="url(#window-inset)" d="M87 567V180C88 30 213 -28 337 49Q400 81 407 192V563Z M1280 562V185C1280 54 1390 -14 1500 39Q1581 62 1590 187V568Z"/><path fill="black" filter="url(#capital-feather)" d="M65 142L119 153 124 172 115 190 96 204 65 207Z M408 145L393 156 392 174 401 194 435 205 435 142Z M1250 142L1299 152 1303 176 1293 191 1282 196 1250 205Z M1595 146L1565 154 1560 174 1569 193 1590 207 1620 210Z"/></mask>
    <radialGradient id="day-sky"><stop stop-color="#fff4ce" stop-opacity=".62"/><stop offset=".36" stop-color="#e9d6aa" stop-opacity=".21"/><stop offset="1" stop-color="#b3c8ce" stop-opacity="0"/></radialGradient>
    <linearGradient id="day-shaft" x1="0" y1="0" x2=".45" y2="1"><stop stop-color="#fff5d9" stop-opacity="0"/><stop offset=".3" stop-color="#f2e6c8" stop-opacity=".12"/><stop offset="1" stop-color="#eddfbd" stop-opacity="0"/></linearGradient>
    <linearGradient id="floor-sun" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#fbe3a9" stop-opacity=".06"/><stop offset=".4" stop-color="#ffe9b7" stop-opacity=".21"/><stop offset="1" stop-color="#d9e4db" stop-opacity=".06"/></linearGradient>
    <radialGradient id="lantern-bounce"><stop stop-color="#efaa52" stop-opacity=".16"/><stop offset="1" stop-color="#ec9b45" stop-opacity="0"/></radialGradient>
    <radialGradient id="moon-sky"><stop stop-color="#b5d1e0" stop-opacity=".19"/><stop offset="1" stop-color="#5a829b" stop-opacity="0"/></radialGradient>
    <filter id="light-penumbra"><feGaussianBlur stdDeviation="2"/></filter>
    <mask id="floor-light-breaks"><rect width="1672" height="941" fill="white"/>
      <g fill="black" filter="url(#light-penumbra)">
        <path d="M82 586L98 586 -97 941 -130 941Z M146 586L160 586 -20 941 -51 941Z M211 586L229 586 61 941 28 941Z M276 586L292 586 140 941 108 941Z M335 586L356 586 222 941 184 941Z"/>
        <path d="M1280 583L1299 583 1075 941 1040 941Z M1345 583L1360 583 1146 941 1115 941Z M1410 583L1428 583 1225 941 1190 941Z M1480 583L1498 583 1305 941 1270 941Z"/>
        <path d="M0 788L390 780 380 802 0 813Z M1150 782L1550 791 1533 813 1135 805Z"/>
      </g>
    </mask>
  </defs>
  <g class="daylight">
    <g mask="url(#light-openings)" class="exterior-sun" opacity=".65">
      <ellipse cx="195" cy="128" rx="255" ry="330" fill="url(#day-sky)"/>
      <ellipse cx="1410" cy="117" rx="265" ry="370" fill="url(#day-sky)"/>
    </g>
    <g class="daylight-shafts" fill="url(#day-shaft)">
      <path d="M175 65L210 58 85 941 -40 941Z M297 43L316 47 207 941 149 941Z M1400 65L1450 60 1250 941 1100 941Z"/>
    </g>
    <g mask="url(#floor-light-breaks)" fill="url(#floor-sun)" filter="url(#floor-perimeter)">
      <path d="M47 744L374 739 278 941 -54 941Z M1225 748L1538 752 1440 941 1090 941Z"/>
    </g>
  </g>
  <g class="moonlight" mask="url(#light-openings)" fill="url(#moon-sky)">
    <ellipse cx="1400" cy="115" rx="245" ry="385"/><ellipse cx="258" cy="125" rx="195" ry="305"/>
  </g>
  <g class="interior-bounce" fill="url(#lantern-bounce)">
    <ellipse cx="468" cy="304" rx="117" ry="235"/><ellipse cx="1190" cy="298" rx="100" ry="242"/>
    <ellipse cx="1195" cy="738" rx="195" ry="132"/>
  </g>`;
  // Boot contacts measured from the admitted 432x768 alpha in the fixed stage.
  light.insertAdjacentHTML('beforeend', `<defs><filter id="resident-shadow-soft"><feGaussianBlur stdDeviation="12"/></filter><filter id="resident-contact-soft"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <g class="resident-ground-shadows" fill="#080b0d">
      <g filter="url(#resident-shadow-soft)" opacity=".72">
        <path d="M117 887Q158 880 205 875L156 934Q107 950 58 941Z"/>
        <path d="M327 867Q360 864 378 888L441 905 389 948 310 941 263 918Z"/>
      </g>
      <g filter="url(#resident-contact-soft)" opacity=".88">
        <ellipse cx="196" cy="884" rx="22" ry="5"/><ellipse cx="129" cy="896" rx="24" ry="6"/>
        <ellipse cx="341" cy="874" rx="23" ry="6"/><ellipse cx="427" cy="913" rx="21" ry="6"/>
      </g>
    </g>`);
  return light;
}
