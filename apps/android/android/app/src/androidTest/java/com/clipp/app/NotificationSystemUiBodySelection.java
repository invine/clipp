package com.clipp.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Test-only public-node decision and one native gesture; no product destination API. */
final class NotificationSystemUiBodySelection {
    interface Clock { long uptime(); long elapsed(); }
    interface Ports {
        boolean current();
        Owner owner();
        List<Object> query(Object root,String value,boolean resource);
        Node node(Object handle,boolean refresh);
        Object parent(Object handle);
        boolean same(Object a,Object b);
        Touch touch(int x,int y);
        boolean close();
    }
    static final class Limit extends RuntimeException { final int reason;Limit(int value){reason=value;} }
    static void require(boolean value,int reason){if(!value)throw new Limit(reason);}
    static boolean readinessRoute(boolean ready,boolean passive,boolean nativeBody,boolean windowed){return ready&&!windowed&&(passive!=nativeBody);}
    static final class Ledger {
        private int count;boolean complete=true;
        int remaining(){return 128-count;}
        List<Object> own(List<?> returned){
            List<Object> owned=new ArrayList<>();if(returned==null)return owned;
            int take=Math.min(remaining(),returned.size());
            for(int i=0;i<take;i++){owned.add(returned.get(i));count++;}
            if(take<returned.size())complete=false;return owned;
        }
    }
    static final class Owner {
        final Object root;final int window;final int[] bounds;
        Owner(Object root,int window,int[] bounds){this.root=root;this.window=window;this.bounds=bounds;}
    }
    static final class Node {
        final int window,pkg;final String resource,text;final boolean textView,visible,enabled;final int[] bounds;
        Node(int window,int pkg,String resource,String text,boolean textView,boolean visible,boolean enabled,int[] bounds){
            this.window=window;this.pkg=pkg;this.resource=resource;this.text=text;this.textView=textView;this.visible=visible;this.enabled=enabled;this.bounds=bounds;
        }
    }
    static final class Touch {
        final boolean down,up;final long downAt,downReturned,upAt,upReturned;
        Touch(boolean down,boolean up,long downAt,long downReturned,long upAt,long upReturned){this.down=down;this.up=up;this.downAt=downAt;this.downReturned=downReturned;this.upAt=upAt;this.upReturned=upReturned;}
    }
    static final class Result {
        int reason,window=-1,x,y,queries;boolean complete,restored,beforeCurrent,afterCurrent,proofRechecked;
        int[] windowBounds,templateBounds,bodyBounds;
        long start,startElapsed,end,endElapsed,finished,finishedElapsed;Touch touch;
    }
    private static final String TEMPLATE="android:id/status_bar_latest_event_content";
    private static final String[] CONTROLS={"android:id/actions","android:id/action0","android:id/action_container","android:id/expand_button","android:id/expand_button_touch_container"};
    private static final class Evidence {
        final Object handle;final Node node;
        Evidence(Object handle,Node node){this.handle=handle;this.node=node;}
    }
    private static final class Selection {
        final Ports ports;final Clock clock;final Result result;final List<Evidence> evidence=new ArrayList<>();
        Owner owner;Object template;
        Selection(Ports ports,Clock clock,Result result){this.ports=ports;this.clock=clock;this.result=result;}
        void check(){require(clock.uptime()<result.end&&clock.elapsed()<result.endElapsed,1);}
        interface Read<T>{T get();}
        <T>T read(Read<T> operation){check();T value=operation.get();check();return value;}
        List<Object> query(Object root,String text,boolean resource){
            require(result.queries<8,2);result.queries++;
            List<Object> values=read(()->ports.query(root,text,resource));
            require(values!=null&&values.size()<=4,3);return values;
        }
        Node node(Object handle){
            require(handle!=null,4);Node value=read(()->ports.node(handle,false));
            require(valid(value),4);evidence.add(new Evidence(handle,value));return value;
        }
        boolean valid(Node n){return n!=null&&n.window==owner.window&&(n.pkg==2||n.pkg==3)&&n.resource!=null&&n.text!=null&&n.text.length()<=8192&&rect(n.bounds);}
        Object template(Object anchor,int[] anchorBounds){
            Object n=anchor;
            for(int depth=0;depth<=6;depth++){
                Node value=node(n);require(value.visible&&value.enabled&&area(value.bounds)&&inside(anchorBounds,value.bounds),4);
                if(TEMPLATE.equals(value.resource)){require(value.visible&&value.enabled,4);return n;}
                require(depth<6,5);Object current=n;n=read(()->ports.parent(current));require(n!=null,4);
            }
            throw new Limit(5);
        }
        Object identity(String needle){
            List<Object> values=query(owner.root,needle,false);Object found=null;
            for(Object value:values){
                Node n=node(value);
                if(!n.textView||!token(n.text,needle))continue;
                require(n.visible&&n.enabled&&area(n.bounds)&&inside(n.bounds,owner.bounds),4);
                require(found==null,6);Object body=template(value,n.bounds);
                if(template==null)template=body;else require(ports.same(template,body),6);
                found=value;
            }
            require(found!=null,7);return found;
        }
    }
    private static boolean rect(int[] r){return r!=null&&r.length==4&&r[2]>=r[0]&&r[3]>=r[1];}
    private static boolean area(int[] r){return rect(r)&&r[2]>r[0]&&r[3]>r[1];}
    private static boolean inside(int[] a,int[] b){return a[0]>=b[0]&&a[1]>=b[1]&&a[2]<=b[2]&&a[3]<=b[3];}
    private static boolean contains(int[] r,int x,int y){return r[0]<x&&x<r[2]&&r[1]<y&&y<r[3];}
    private static boolean alpha(char c){return c>='A'&&c<='Z'||c>='a'&&c<='z'||c>='0'&&c<='9'||c=='_';}
    private static boolean token(String text,String value){
        int at=text.indexOf(value);if(at<0)return false;int end=at+value.length();
        return (at==0||!alpha(text.charAt(at-1)))&&(end==text.length()||!alpha(text.charAt(end)));
    }
    private static boolean equal(Node a,Node b){return b!=null&&a.window==b.window&&a.pkg==b.pkg&&a.resource.equals(b.resource)&&a.text.equals(b.text)&&a.textView==b.textView&&a.visible==b.visible&&a.enabled==b.enabled&&Arrays.equals(a.bounds,b.bounds);}
    static Result run(Ports ports,Clock clock,String peerId,String peerName,long readyEnd,long readyEndElapsed){
        Result r=new Result();r.start=clock.uptime();r.startElapsed=clock.elapsed();r.end=Math.min(readyEnd,r.start+5000);r.endElapsed=Math.min(readyEndElapsed,r.startElapsed+5000);
        Selection s=new Selection(ports,clock,r);
        try{
            r.beforeCurrent=s.read(ports::current);require(r.beforeCurrent,8);
            s.owner=s.read(ports::owner);require(s.owner!=null&&s.owner.root!=null&&s.owner.window>=0&&area(s.owner.bounds),4);r.window=s.owner.window;r.windowBounds=s.owner.bounds.clone();
            s.identity(peerId);Object name=s.identity(peerName);Node body=s.node(name),template=s.node(s.template);
            require(inside(body.bounds,template.bounds)&&inside(template.bounds,s.owner.bounds),4);
            r.templateBounds=template.bounds.clone();r.bodyBounds=body.bounds.clone();
            r.x=(int)(((long)body.bounds[0]+body.bounds[2])/2);r.y=(int)(((long)body.bounds[1]+body.bounds[3])/2);
            require(contains(body.bounds,r.x,r.y),4);
            List<Object> titles=s.query(s.template,"android:id/title",true);Object title=null;
            for(Object value:titles){Node n=s.node(value);require("android:id/title".equals(n.resource),4);if(!"Pairing request".equals(n.text))continue;require(title==null&&n.textView&&n.visible&&n.enabled&&area(n.bounds)&&inside(n.bounds,template.bounds),6);require(ports.same(s.template,s.template(value,n.bounds)),6);title=value;require(!contains(n.bounds,r.x,r.y),9);}
            require(title!=null,7);
            for(String id:CONTROLS)for(Object value:s.query(s.template,id,true)){
                Node n=s.node(value);require(id.equals(n.resource),4);
                if(n.visible&&area(n.bounds)){require(inside(n.bounds,template.bounds),4);require(!contains(n.bounds,r.x,r.y),9);}
            }
            // Refresh only the bounded positive proof path; never traverse unrelated children.
            for(Evidence e:s.evidence){Node fresh=s.read(()->ports.node(e.handle,true));require(equal(e.node,fresh),10);}
            Owner fresh=s.read(ports::owner);require(fresh!=null&&fresh.window==s.owner.window&&ports.same(s.owner.root,fresh.root)&&Arrays.equals(s.owner.bounds,fresh.bounds),10);
            r.afterCurrent=s.read(ports::current);require(r.afterCurrent,8);s.check();r.proofRechecked=true;
            r.touch=ports.touch(r.x,r.y);s.check();
            require(r.touch!=null&&r.touch.down&&r.touch.up&&r.touch.downAt>=r.start&&r.touch.downAt<=r.touch.downReturned&&r.touch.downReturned<=r.touch.upAt&&r.touch.upAt<=r.touch.upReturned&&r.touch.upReturned<r.end,11);
        }catch(Limit limit){r.reason=limit.reason;}
        catch(Throwable failure){r.reason=13;}
        finally{
            try{r.restored=ports.close();}catch(Throwable failure){r.restored=false;}
            r.finished=clock.uptime();r.finishedElapsed=clock.elapsed();
            if(!r.restored&&r.reason==0)r.reason=12;
            if((r.finished>=r.end||r.finishedElapsed>=r.endElapsed)&&r.reason==0)r.reason=1;
            r.complete=r.reason==0&&r.beforeCurrent&&r.afterCurrent&&r.touch!=null&&r.restored;
        }
        return r;
    }
}
