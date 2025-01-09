import { randomChoice } from "./Random";

export class Color {
  constructor(red, green, blue) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.rgb = `rgb(${red}, ${green}, ${blue})`;
  }
}

export function invertColor(color) {
  const red = 255 - color.red;
  const green = 255 - color.green;
  const blue = 255 - color.blue;
  return new Color(red, green, blue);
}

export const getRandomColor = (min=0, max=255) => {
  const colorVals = Array.from({ length: (max - min) + 1}, (_, i) => i + min);
  const red = randomChoice(colorVals);
  const green = randomChoice(colorVals);
  const blue = randomChoice(colorVals);
  return new Color(red, green, blue);
}