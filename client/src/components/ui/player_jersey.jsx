import React from "react";

export default function PlayerJersey({ player, color, score, isCaptain }) {
  return (
    <div className="flex flex-col items-center justify-center w-20 sm:w-24 relative group cursor-pointer transition-transform hover:scale-110 z-10">
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 mb-1 drop-shadow-xl filter">
        {/* Jersey SVG */}
        <svg
          viewBox="0 0 504.808 504.808"
          className="w-full h-full"
        >
          <polyline style={{fill: color}} points="104.96,58.152 103.976,58.792 0,162.768 77.68,241.312 116.184,201.92 116.184,491.528 388.184,491.528 388.184,201.92 426.688,241.312 504.368,162.76 400.384,58.776 399.416,58.152 399.568,57.952 399.472,57.856 399.416,58.152 310.792,27.528 193.568,27.528 104.96,58.152 "/>
          <polyline style={{fill: color}} points="104.96,58.152 103.976,58.792 24.496,187.256 77.68,241.312 116.184,201.92 116.184,491.528 388.184,491.528 388.184,201.92 426.688,241.312 504.368,162.76 400.384,58.776 399.416,58.152 399.568,57.952 399.472,57.856 399.416,58.152 310.792,27.528 193.568,27.528 104.96,58.152 "/>
          <polyline style={{fill: color}} points="196.184,491.528 388.184,491.528 388.184,201.92 426.688,241.312 504.808,162.76 399.496,57.856 399.624,57.952 399.624,57.952 399.496,57.856 399.496,57.856 310.792,27.528 196.184,27.528 "/>
          <polyline style={{fill: color}} points="386.424,201.92 425.816,241.312 504.368,162.76 400.384,58.776 399.568,57.952 399.568,57.952 399.472,57.856 399.416,57.904 "/>
          <path style={{fill: "#535859"}} d="M294.792,19.528h-85.224l-22.936,10.168c1.08,1.968,70.312,75.952,65.552,75.952c-4.76,0,64.464-73.92,65.552-75.888L294.792,19.528z"/>
          <path style={{fill: color}} d="M252.184,35.104c-19.568,0-37.24,5.16-49.944,13.456c18.496,22.488,47.168,57.512,49.944,63.92c2.776-6.408,31.448-41.44,49.944-63.92C289.432,40.264,271.76,35.104,252.184,35.104z"/>
          <polygon style={{fill: color}} points="212.776,74.448 251.44,113.776 239.928,62.136 "/>
          <polygon style={{fill: color}} points="207.808,86.264 177.616,32.056 204.184,13.28 239.928,62.136 "/>
          <polygon style={{fill: color}} points="207.808,86.264 204.112,32.056 204.184,13.28 239.928,62.136 "/>
          <polygon style={{fill: color}} points="291.6,74.448 252.936,113.776 264.448,62.136 "/>
          <polygon style={{fill: color}} points="296.568,86.264 326.76,32.056 300.184,13.28 264.448,62.136 "/>
          <g>
            <polygon style={{fill: color}} points="296.568,86.264 300.264,32.056 300.184,13.28 264.448,62.136 	"/>
            <circle style={{fill: color}} cx="252.184" cy="125.016" r="5"/>
          </g>
          <path style={{fill: color}} d="M248.648,121.48c1.96-1.952,5.12-1.968,7.064,0c1.96,1.952,1.96,5.112,0,7.064"/>
          <circle style={{fill: color}} cx="252.184" cy="153.776" r="5"/>
          <path style={{fill: color}} d="M248.648,150.248c1.96-1.952,5.12-1.968,7.064,0c1.96,1.952,1.96,5.112,0,7.064"/>
          <path style={{fill: color}} d="M339.632,169.104c-7.184,0-13-5.816-13-13c0-1.544,0.312-3.016,0.816-4.392c-4.424,2.08-7.488,6.528-7.488,11.72c0,7.184,5.824,13,13,13c5.624,0,10.376-3.592,12.184-8.592C343.464,168.64,341.6,169.104,339.632,169.104z"/>
        </svg>
        
        {/* Captain Badge */}
        {isCaptain && (
          <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[10px] sm:text-xs font-bold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm z-10">
            C
          </div>
        )}
      </div>

      {/* Player Info Label */}
      <div className="bg-black/70 backdrop-blur-[2px] px-1 py-0.5 rounded text-center w-24 max-w-sm border border-white/10 shadow-lg">
        <div className="text-[9px] sm:text-[10px] text-white font-semibold truncate leading-tight">
          {player.name}
        </div>
        <div className="text-[9px] sm:text-[10px] text-primary-500 font-bold">
          {score} pts
        </div>
      </div>
      
      {/* Team Name Tooltip */}
      <div className="absolute opacity-0 group-hover:opacity-100 -bottom-6 bg-gray-800 text-white text-[9px] px-2 py-1 rounded transition-opacity whitespace-nowrap z-20 pointer-events-none border border-gray-600">
        {player.team_name} • {player.role}
      </div>
    </div>
  );
}
