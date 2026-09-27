import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
}

export const BackIcon: React.FC<IconProps> = ({ size = 24, color = '#5750A4' }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M6.95426 14.0309L2.40039 9.41544L6.95426 4.79995M2.40039 9.41544L17.6004 9.41544C19.8095 9.41544 21.6004 11.2063 21.6004 13.4154L21.6004 15.2C21.6004 17.4091 19.8095 19.2 17.6004 19.2L12.0004 19.2" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
};