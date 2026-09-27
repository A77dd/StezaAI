import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
}

export const ActionIcon: React.FC<IconProps> = ({ size = 24, color = '#5750A4' }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="6" r="2" fill={color}/>
      <circle cx="12" cy="12" r="2" fill={color}/>
      <circle cx="12" cy="18" r="2" fill={color}/>
    </svg>
  );
};