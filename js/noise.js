// Simplex noise for procedural terrain
class SimplexNoise{
  constructor(seed=42){
    this.g=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    this.p=Array.from({length:256},(_,i)=>i);
    let s=seed|0;for(let i=255;i>0;i--){s=(s*16807)%2147483647;if(s<0)s+=2147483646;const j=s%(i+1);[this.p[i],this.p[j]]=[this.p[j],this.p[i]]}
    this.pm=new Uint8Array(512);for(let i=0;i<512;i++)this.pm[i]=this.p[i&255];
  }
  n2d(x,y){
    const F=.5*(Math.sqrt(3)-1),G=(3-Math.sqrt(3))/6;
    const s=(x+y)*F,i=Math.floor(x+s),j=Math.floor(y+s),t=(i+j)*G;
    const x0=x-(i-t),y0=y-(j-t);
    const i1=x0>y0?1:0,j1=x0>y0?0:1;
    const x1=x0-i1+G,y1=y0-j1+G,x2=x0-1+2*G,y2=y0-1+2*G;
    const ii=i&255,jj=j&255;
    const gi0=this.pm[ii+this.pm[jj]]%12,gi1=this.pm[ii+i1+this.pm[jj+j1]]%12,gi2=this.pm[ii+1+this.pm[jj+1]]%12;
    let n0=0,n1=0,n2;
    let q=.5-x0*x0-y0*y0;q=q<0?0:(q*=q,q*q)*(this.g[gi0][0]*x0+this.g[gi0][1]*y0);n0=q;
    q=.5-x1*x1-y1*y1;q=q<0?0:(q*=q,q*q)*(this.g[gi1][0]*x1+this.g[gi1][1]*y1);n1=q;
    q=.5-x2*x2-y2*y2;q=q<0?0:(q*=q,q*q)*(this.g[gi2][0]*x2+this.g[gi2][1]*y2);n2=q;
    return 70*(n0+n1+n2);
  }
  fbm(x,y,oct=4){let v=0,a=1,f=1,m=0;for(let i=0;i<oct;i++){v+=this.n2d(x*f,y*f)*a;m+=a;a*=.5;f*=2}return v/m}
}
export default SimplexNoise;
