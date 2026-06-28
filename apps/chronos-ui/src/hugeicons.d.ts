declare module '@hugeicons/core-free-icons/*' {
  type IconSvgObject = readonly (readonly [
    string,
    {
      readonly [key: string]: string | number
    },
  ])[]

  const icon: IconSvgObject
  export default icon
}
