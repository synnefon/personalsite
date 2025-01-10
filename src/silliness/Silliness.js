import React, { useState } from 'react';

import Snek from "./Snek";
import RainCloud from "./raincloud/Raincloud"

export default function Silliness() {
  const [showLightning, setShowLightning] = useState(false);

  return (
    <div id="app-base">
      <RainCloud showLightning={showLightning} setShowLightning={setShowLightning}/>
      <Snek/>
    </div>
  );
}