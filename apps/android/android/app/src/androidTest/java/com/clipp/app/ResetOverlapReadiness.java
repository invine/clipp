package com.clipp.app;

/** Isolated acceptance-only, finite observation; never retains DOM content. */
final class ResetOverlapReadiness {
    static String expression(String element) {
        return "(() => { const e = " + element + "; const modal=document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]');"
            + " const matches=root=>[...root.querySelectorAll('button')].filter(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Continue reset overlap');"
            + " const all=matches(document), scoped=matches(modal||document);"
            + " let sample={ready:false}, hit=null, rect=null, x=0, y=0;"
            + " if(e){rect=e.getBoundingClientRect();x=rect.x+rect.width/2;y=rect.y+rect.height/2;hit=document.elementFromPoint(x,y);"
            + " sample={x,y,width:innerWidth,height:innerHeight,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},"
            + " shell:document.querySelector('.app-shell')?.className,ready:!e.disabled&&!e.closest('[inert], [hidden], [aria-hidden=\"true\"]')&&rect.width>0&&rect.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&!!hit&&(hit===e||e.contains(hit))};}"
            + " const vector={modal:!!modal,documentCandidate:all.length>0,scopeCandidate:scoped.length>0,"
            + " selected:!!e,scopeDisabled:scoped.some(b=>!!b.disabled),scopeHidden:scoped.some(b=>!!b.closest('[inert], [hidden], [aria-hidden=\"true\"]')),scopeHasRects:scoped.some(b=>b.getClientRects().length>0),"
            + " positiveSize:!!rect&&rect.width>0&&rect.height>0,inViewport:!!rect&&x>0&&y>0&&x<innerWidth&&y<innerHeight,"
            + " hitTarget:!!e&&!!hit&&(hit===e||e.contains(hit))};"
            + " return JSON.stringify({sample,vector}); })()";
    }
}
