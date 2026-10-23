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
}
