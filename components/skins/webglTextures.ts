/** Whether a texture side can repeat on WebGL 1, which wraps only power-of-two sizes. */
export const powerOfTwo = (n: number) => (n & (n - 1)) === 0;
