export const GHOST_HAND_PLANE='matrix(1 .107 -.16 .40 288 331.2)';
export function ghostHandCards(className='ritual-card') {
  return ['A','K','Q','J','2'].map((rank,i)=>{
    const suit=i===4?'♥':'♠',ink=i===4?'#dc969a':'#c7def0';
    return `<g class="${className}" transform="translate(${i*66} 0)"><rect width="56" height="80" rx="4" fill="#ece5d4" fill-opacity=".13" stroke="#c7def0" stroke-opacity=".75" stroke-width="1.2"/><rect x="3" y="3" width="50" height="74" rx="3" fill="none" stroke="#ece5d4" stroke-opacity=".28" stroke-width=".6"/><text x="8" y="21" font-size="18" font-family="Georgia" fill="${ink}">${rank}</text><text x="28" y="57" text-anchor="middle" font-size="31" font-family="Georgia" fill="${ink}" fill-opacity=".85">${suit}</text><text transform="translate(48 59) rotate(180)" font-size="12" font-family="Georgia" fill="${ink}">${rank}</text></g>`;
  }).join('');
}
/** A brief volume rising from the felt, not an outline glow around each card. */
export function ghostHandFog(time:number,count=5,id='desk-poof') {
  if(time<=0||time>=2.2||count===0)return '';
  return `<defs><radialGradient id="${id}"><stop stop-color="#dce3d6" stop-opacity=".72"/><stop offset=".48" stop-color="#b7cbd0" stop-opacity=".35"/><stop offset="1" stop-color="#abc3c9" stop-opacity="0"/></radialGradient></defs>`+
    Array.from({length:count*9},(_,i)=>{
      const card=Math.floor(i/9),j=i%9,spread=(j-4)*6;
      const t=Math.max(0,(time-card*.065)/2.2),fade=Math.sin(Math.PI*Math.pow(t,.62))*(1-t)*.29;
      const x=310+card*66+spread*(.3+1.8*t)-(20+(i*13)%35)*t+Math.sin(i*2.1+t*4)*9;
      const y=353+card*7-(40+(i*17)%58)*t-((i*7)%23)*Math.sin(t*Math.PI);
      return `<ellipse cx="${x}" cy="${y}" rx="${14+28*t+(j%3)*5}" ry="${9+24*t+(j%4)*3}" fill="url(#${id})" opacity="${fade}"/>`;
    }).join('');
}
export function createGhostHand():SVGSVGElement {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 960 720');svg.setAttribute('aria-hidden','true');svg.classList.add('busted-royal');
  svg.innerHTML=`<g class="busted-cards" transform="${GHOST_HAND_PLANE}">${ghostHandCards('busted-card')}</g><g class="busted-fog"/>`;
  return svg;
}
export function drawGhostHand(svg:SVGSVGElement,time:number) {
  const dissolve=Math.max(0,time-4.8),show=Math.max(0,Math.min(1,(time-.5)/.65));
  svg.dataset.phase=time<.5?'waiting':time<4.8?'hand':time<7?'fog':'gone';
  svg.querySelector<SVGGElement>('.busted-cards')!.style.opacity=String(show*Math.max(0,1-dissolve/.65));
  svg.querySelector('.busted-fog')!.innerHTML=ghostHandFog(dissolve,5,'stage-poof');
}
