window.BICAR_AutoPartsAPI={
  async j(u,auth=false){const token=localStorage.getItem('bicar_customer_token_v72')||'';const headers=auth&&token?{Authorization:'Bearer '+token}:{};const r=await fetch(u,{headers}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'API error');return d},
  status(){return this.j('/api/autoparts/status')},
  vin(v){return this.j('/api/autoparts/vin/'+encodeURIComponent(v),false)},
  categories(v){return this.j('/api/autoparts/vehicles/'+encodeURIComponent(v)+'/categories',true)},
  articles(v,c){return this.j('/api/autoparts/vehicles/'+encodeURIComponent(v)+'/categories/'+encodeURIComponent(c)+'/articles',true)},
  article(id){return this.j('/api/autoparts/articles/'+encodeURIComponent(id),true)}
};
