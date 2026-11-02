package com.clipp.app;
import java.util.List;
import java.util.HashSet;

/** Test-only readiness decision; no Android/input/tree traversal API. */
final class NotificationSystemUiReadiness {
    interface Clock { long uptime(); long elapsed(); }
    static final class Limit extends RuntimeException { final int reason; Limit(int value) { reason=value; } }
    static void require(boolean value,int reason) { if(!value)throw new Limit(reason); }
    static final class Budget {
        final Clock clock;
        final long start,startElapsed,end,endElapsed,preparationEnd,preparationEndElapsed;
        Budget(Clock clock,long methodEnd) {
            this.clock=clock;start=clock.uptime();startElapsed=clock.elapsed();end=Math.min(methodEnd,start+60000);
            require(end>start,1);endElapsed=startElapsed+(end-start);
            preparationEnd=Math.min(end,start+5000);preparationEndElapsed=startElapsed+(preparationEnd-start);
        }
        long remainingPreparation() { return Math.min(preparationEnd-clock.uptime(),preparationEndElapsed-clock.elapsed()); }
        void checkPreparation() { require(remainingPreparation()>0,1); }
        long eventTimeout() { long value=Math.min(2000,remainingPreparation()-3000);require(value>0,1);return value; }
        long idleTimeout() { long value=Math.min(1000,remainingPreparation());require(value>100,1);return value; }
        void checkReady() { require(clock.uptime()<end&&clock.elapsed()<endElapsed,1); }
    }
    static final class EventGate {
        final Budget budget;final long actionStart;
        final int[] event=new int[3];long eventTime=-1;int count,stopReason;
        EventGate(Budget budget,long actionStart){this.budget=budget;this.actionStart=actionStart;}
        boolean beforeRead(){
            if(budget.remainingPreparation()<=0){stopReason=1;return false;}
            if(count>=128){stopReason=2;return false;}count++;return true;
        }
        boolean accept(int kind,int window,boolean packageMatches,long at){
            if(budget.remainingPreparation()<=0){stopReason=1;return true;}
            if(at<actionStart||at>budget.clock.uptime()||window<0||!packageMatches||(kind!=1&&kind!=2))return false;
            event[0]=kind;event[1]=window;event[2]=1;eventTime=at;return true;
        }
    }
    private static boolean contains(int[] row,int offset,long twiceX,long twiceY) {
        return 2L*row[offset]<twiceX&&twiceX<2L*row[offset+2]&&2L*row[offset+1]<twiceY&&twiceY<2L*row[offset+3];
    }
    static int requireWindow(int[] originalWindow,List<int[]> rows,int[] event) {
        require(originalWindow!=null&&originalWindow.length==4&&originalWindow[2]>originalWindow[0]&&originalWindow[3]>originalWindow[1],2);
        require(event!=null&&event.length==3&&(event[0]==1||event[0]==2)&&event[1]>=0&&event[2]==1,3);
        require(rows!=null&&!rows.isEmpty()&&rows.size()<=8,4);
        long x=(long)originalWindow[0]+originalWindow[2],y=(long)originalWindow[1]+originalWindow[3];
        HashSet<Integer> ids=new HashSet<>();int matched=-1,count=0;
        for(int[] row:rows) {
            require(row!=null&&row.length==17&&row[0]>=0&&ids.add(row[0])&&row[1]>=1&&row[1]<=6&&row[2]==0
                &&(row[3]==0||row[3]==1)&&(row[4]==0||row[4]==1)&&row[5]>=0&&row[5]<=3&&row[8]>=row[6]&&row[9]>=row[7]
                &&row[10]==row[0]&&row[11]>=0&&row[11]<=3&&row[14]>=row[12]&&row[15]>=row[13]&&(row[16]==0||row[16]==1),5);
            if(row[1]==3&&(row[3]==1||row[4]==1)&&row[5]==2&&row[11]==2&&row[16]==1&&contains(row,6,x,y)&&contains(row,12,x,y)){count++;matched=row[0];}
        }
        require(count==1&&matched==event[1],6);return matched;
    }
    /** Acquired-root lifetime, including returns before any sample is possible. */
    static final class RootLease implements AutoCloseable {
        private final Runnable release;private boolean closed;
        RootLease(Runnable release){this.release=release;}
        public void close(){if(!closed){closed=true;release.run();}}
    }

    /** Exclusive private diagnostic file. A refused create never owns cleanup. */
    static void publishFirstWindow(java.nio.file.Path target,byte[] png,BlockedWindowCapture.Check check) {
        java.nio.file.Path pending=target.resolveSibling(target.getFileName()+".pending");
        boolean owned=false,complete=false;
        try {
            check.run();require(png!=null&&png.length>0&&png.length<=BlockedWindowCapture.MAX_PNG,5);
            require(!java.nio.file.Files.exists(target,java.nio.file.LinkOption.NOFOLLOW_LINKS)
                &&!java.nio.file.Files.exists(pending,java.nio.file.LinkOption.NOFOLLOW_LINKS),6);
            check.run();
            try(java.io.OutputStream stream=java.nio.file.Files.newOutputStream(target,java.nio.file.StandardOpenOption.CREATE_NEW,java.nio.file.StandardOpenOption.WRITE)) {
                owned=true;check.run();stream.write(png);check.run();
            }
            check.run();complete=true;
        } catch(Limit failure){throw failure;}
          catch(Exception failure){throw new IllegalStateException("Diagnostic PNG publication failed");}
        finally {
            if(owned&&!complete)try{java.nio.file.Files.delete(target);}
            catch(java.io.IOException failure){throw new IllegalStateException("Owned diagnostic cleanup failed");}
        }
    }

    /** One advisory image at the already-observed blocked first-window boundary.
     * Ports own Android handles; this policy never discovers a window or sends input. */
    static final class BlockedWindowCapture {
        interface Check { void run(); }
        interface Window { int id(); int type(); void close(); }
        interface Pixels { int width(); int height(); byte[] png(Check check,int cap); void close(); }
        interface Port { Window window(); Pixels screenshot(); void publish(byte[] png); }
        static final int MAX_PNG=1_048_576;
        static final long MAX_PIXELS=8_388_608;
        static final class Result {
            final boolean attempted,complete;final int reason,windowId,windowType,width,height,bytes;
            final long started,finished,end;final String sha256;
            Result(boolean attempted,boolean complete,int reason,int id,int type,int width,int height,int bytes,long started,long finished,long end,String sha256){
                this.attempted=attempted;this.complete=complete;this.reason=reason;windowId=id;windowType=type;
                this.width=width;this.height=height;this.bytes=bytes;this.started=started;this.finished=finished;this.end=end;this.sha256=sha256;
            }
        }
        private final boolean enabled;private final Clock clock;private final long end;
        private final java.util.function.BooleanSupplier active;
        private final java.util.concurrent.atomic.AtomicBoolean attempted=new java.util.concurrent.atomic.AtomicBoolean();
        private volatile Result result;
        BlockedWindowCapture(boolean enabled,Clock clock,long end,java.util.function.BooleanSupplier active){
            this.enabled=enabled;this.clock=clock;this.end=end;this.active=active;
            result=new Result(false,false,0,-1,0,0,0,0,0,0,end,"");
        }
        private void check(){require(active.getAsBoolean()&&clock.uptime()<end,2);}
        Result result(){return result;}
        void observe(boolean androidRoot,boolean ownedFocused,int rootWindowId,Port port){
            if(!enabled||!androidRoot||ownedFocused||!attempted.compareAndSet(false,true))return;
            long start=clock.uptime();int reason=3,id=-1,type=0,width=0,height=0;byte[] png=null;String hash="";
            Window window=null;Pixels pixels=null;boolean closed=true;
            result=new Result(true,false,2,-1,0,0,0,0,start,0,end,"");
            try {
                check();require(rootWindowId>=0,3);
                window=port.window();check();require(window!=null,3);
                id=window.id();check();type=window.type();check();require(id==rootWindowId&&type>=1&&type<=6,3);
                result=new Result(true,false,4,id,type,0,0,0,start,0,end,"");
                reason=4;pixels=port.screenshot();check();require(pixels!=null,4);
                width=pixels.width();height=pixels.height();check();
                require(width>0&&height>0&&(long)width*height<=MAX_PIXELS,4);
                reason=5;png=pixels.png(this::check,MAX_PNG);check();require(png!=null&&png.length>0&&png.length<=MAX_PNG,5);
                byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(png);
                StringBuilder hex=new StringBuilder(64);for(byte b:digest)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));hash=hex.toString();check();
                reason=0;
            } catch(Limit failure){reason=failure.reason;}
              catch(Exception failure){if(reason==0)reason=5;}
            finally {
                if(pixels!=null)try{pixels.close();}catch(RuntimeException failure){closed=false;}
                if(window!=null)try{window.close();}catch(RuntimeException failure){closed=false;}
            }
            if(!closed)reason=7;
            if(reason==0)try{check();port.publish(png);check();}catch(Limit failure){reason=failure.reason;}catch(RuntimeException failure){reason=6;}
            long finished=clock.uptime();
            if(reason==0&&(!active.getAsBoolean()||finished>=end))reason=2;
            result=new Result(true,reason==0,reason,id,type,width,height,png==null?0:png.length,start,finished,end,hash);
        }
    }
}
