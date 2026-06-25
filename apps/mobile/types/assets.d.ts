// Static image asset modules. Metro resolves `import logo from './x.png'` to an asset id (number),
// which React Native's <Image source> accepts. Lets us use ES imports instead of require() for images
// (the repo's @typescript-eslint/no-require-imports rule forbids require()).
declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}
