import React from "react";

export const Mom: React.FC<{ holdingBriefcase?: boolean }> = ({
  holdingBriefcase = true,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 400 700"
    width="100%"
    height="100%"
  >
    <g id="mom-full">
      <g id="mom-legs">
        <path
          d="M155 480 L150 600 Q148 620 155 625 L170 625 Q178 620 175 600 L180 480Z"
          fill="#5B8DBE"
          stroke="#3A5F8A"
          strokeWidth="2"
        />
        <path
          d="M220 480 L215 600 Q213 620 220 625 L235 625 Q243 620 240 600 L245 480Z"
          fill="#5B8DBE"
          stroke="#3A5F8A"
          strokeWidth="2"
        />
        <path
          d="M148 620 Q140 625 138 635 Q136 648 150 650 L172 650 Q180 648 178 638 Q176 625 170 620Z"
          fill="#2A2A2A"
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
        <rect x="152" y="650" width="8" height="15" rx="2" fill="#2A2A2A" />
        <path
          d="M213 620 Q205 625 203 635 Q201 648 215 650 L237 650 Q245 648 243 638 Q241 625 235 620Z"
          fill="#2A2A2A"
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
        <rect x="220" y="650" width="8" height="15" rx="2" fill="#2A2A2A" />
      </g>

      <g id="mom-body">
        <path
          d="M145 260 Q140 280 140 320 L140 480 Q140 490 155 490 L245 490 Q260 490 260 480 L260 320 Q260 280 255 260Z"
          fill="#E8B830"
          stroke="#C99A20"
          strokeWidth="2"
        />
        <path
          d="M170 260 Q200 280 230 260"
          fill="none"
          stroke="#C99A20"
          strokeWidth="2"
        />
        <rect
          x="140"
          y="470"
          width="120"
          height="12"
          rx="3"
          fill="#4A7DAA"
          stroke="#3A5F8A"
          strokeWidth="1"
        />
      </g>

      <g id="mom-left-arm">
        <path
          d="M140 270 Q120 280 110 320 L105 380 Q100 400 110 405 L120 400 Q125 390 125 370 L130 310 Q135 285 145 275Z"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="2"
        />
        <ellipse
          cx="110"
          cy="405"
          rx="15"
          ry="12"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="1.5"
        />
      </g>

      <g id="mom-right-arm">
        <path
          d="M260 270 Q280 280 290 320 L295 400 Q298 420 290 425 L280 420 Q275 410 276 390 L272 320 Q268 290 258 278Z"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="2"
        />
        <ellipse
          cx="290"
          cy="425"
          rx="15"
          ry="12"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="1.5"
        />
      </g>

      {holdingBriefcase && (
        <g id="mom-briefcase">
          <rect
            x="265"
            y="430"
            width="70"
            height="55"
            rx="5"
            fill="#2D3748"
            stroke="#1A202C"
            strokeWidth="2"
          />
          <rect
            x="280"
            y="425"
            width="40"
            height="10"
            rx="3"
            fill="#2D3748"
            stroke="#1A202C"
            strokeWidth="2"
          />
          <rect
            x="293"
            y="453"
            width="14"
            height="8"
            rx="2"
            fill="#D4A017"
            stroke="#B8860B"
            strokeWidth="1"
          />
        </g>
      )}

      <g id="mom-neck">
        <rect
          x="185"
          y="240"
          width="30"
          height="25"
          rx="5"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="1.5"
        />
      </g>

      <g id="mom-head">
        <ellipse
          cx="200"
          cy="170"
          rx="70"
          ry="80"
          fill="#F5D0B0"
          stroke="#D4A882"
          strokeWidth="2"
        />
        <path
          d="M130 170 Q125 100 150 70 Q170 45 200 40 Q230 35 250 55 Q275 80 270 140 Q280 120 275 95 Q265 50 230 30 Q200 15 165 25 Q130 40 118 80 Q110 110 115 155 Q120 170 130 170Z"
          fill="#8B4513"
          stroke="#6B3410"
          strokeWidth="2"
        />
        <path
          d="M270 140 Q278 160 275 190 Q272 210 260 220 Q270 200 272 175 Q274 155 270 140Z"
          fill="#8B4513"
          stroke="#6B3410"
          strokeWidth="1"
        />
        <circle cx="135" cy="140" r="15" fill="#8B4513" />
        <circle cx="128" cy="165" r="12" fill="#8B4513" />
        <circle cx="133" cy="190" r="14" fill="#8B4513" />
        <circle cx="145" cy="210" r="11" fill="#8B4513" />
        <circle cx="265" cy="150" r="13" fill="#8B4513" />
        <circle cx="270" cy="178" r="12" fill="#8B4513" />
        <circle cx="263" cy="205" r="11" fill="#8B4513" />
        <circle cx="150" cy="60" r="14" fill="#8B4513" />
        <circle cx="180" cy="45" r="13" fill="#8B4513" />
        <circle cx="210" cy="40" r="14" fill="#8B4513" />
        <circle cx="240" cy="50" r="13" fill="#8B4513" />
        <circle cx="258" cy="70" r="12" fill="#8B4513" />
        <path
          d="M170 160 Q175 150 185 155"
          fill="none"
          stroke="#3A2718"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M215 155 Q225 150 230 160"
          fill="none"
          stroke="#3A2718"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="168"
          y1="158"
          x2="165"
          y2="153"
          stroke="#3A2718"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="232"
          y1="158"
          x2="235"
          y2="153"
          stroke="#3A2718"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M198 175 Q200 182 203 178"
          fill="none"
          stroke="#D4A882"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M185 195 Q200 210 215 195"
          fill="none"
          stroke="#C97878"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <ellipse cx="165" cy="190" rx="12" ry="8" fill="#FFBBBB" opacity="0.5" />
        <ellipse cx="235" cy="190" rx="12" ry="8" fill="#FFBBBB" opacity="0.5" />
        <circle
          cx="132"
          cy="195"
          r="5"
          fill="#FFFAF0"
          stroke="#E8E0D0"
          strokeWidth="1"
        />
        <circle
          cx="268"
          cy="195"
          r="5"
          fill="#FFFAF0"
          stroke="#E8E0D0"
          strokeWidth="1"
        />
      </g>
    </g>
  </svg>
);
