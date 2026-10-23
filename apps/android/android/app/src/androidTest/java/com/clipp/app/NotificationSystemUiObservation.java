package com.clipp.app;

import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Arrays;

/** Test-only passive observation policy; ports contain no input/selection action. */
final class NotificationSystemUiObservation {
    interface Clock { long uptime(); long elapsed(); }
    interface Read<T> { T get(); }
    static final class Limit extends RuntimeException {
        final int reason;
        Limit(int reason) { this.reason = reason; }
    }
    static final class Guard {
        final Clock clock;
        final long end, endElapsed;
        int reads;
        Guard(Clock clock, long end, long endElapsed) { this.clock=clock; this.end=end; this.endElapsed=endElapsed; }
        void check() { if (clock.uptime() >= end || clock.elapsed() >= endElapsed) throw new Limit(1); }
        <T> T read(Read<T> operation) {
            check(); if (reads >= 8192) throw new Limit(2); reads++;
            T value = operation.get(); check(); return value;
        }
    }
    interface Ports {
        void begin(Guard guard);
        boolean currentNotification(Guard guard);
        List<Object> windows(Guard guard);
        int[] window(Object window, Guard guard);
        Object root(Object window, Guard guard);
        int[] rootIdentity(Object root, Guard guard);
        Node node(Object node, Guard guard);
        Object child(Object node, int index, Guard guard);
        boolean close();
    }
    static final class Node {
        final int window, packageKind, classKind, resourceKind, flags, matches, children;
        final int[] bounds;
        Node(int window, int packageKind, int classKind, int resourceKind, int[] bounds, int flags, int matches, int children) {
            this.window=window; this.packageKind=packageKind; this.classKind=classKind; this.resourceKind=resourceKind;
            this.bounds=bounds; this.flags=flags; this.matches=matches; this.children=children;
        }
    }
    static final class Result {
        final List<int[]> windows = new ArrayList<>(), nodes = new ArrayList<>();
        final long start, startElapsed, end, endElapsed;
        long finished, finishedElapsed;
        int reason, reads;
        boolean notificationBefore, notificationAfter, restored, complete;
        Result(long start, long startElapsed, long end, long endElapsed) { this.start=start; this.startElapsed=startElapsed; this.end=end; this.endElapsed=endElapsed; }
    }
    private static final class Entry {
        final Object node; final int parent, depth, window;
        Entry(Object node, int parent, int depth, int window) { this.node=node; this.parent=parent; this.depth=depth; this.window=window; }
    }
    static Result observe(Ports ports, Clock clock, long selectionEnd, long selectionEndElapsed) {
        long start=clock.uptime(), elapsed=clock.elapsed();
        Result result=new Result(start,elapsed,Math.min(selectionEnd,start+5000),Math.min(selectionEndElapsed,elapsed+5000));
        Guard guard=new Guard(clock,result.end,result.endElapsed);
        List<int[]> before=new ArrayList<>(); List<Object> roots=new ArrayList<>();
        HashSet<Object> distinct=new HashSet<>();
        try {
            guard.read(()->{ports.begin(guard);return true;});
            result.notificationBefore=guard.read(()->ports.currentNotification(guard));
            if (!result.notificationBefore) throw new Limit(10);
            List<Object> windows=guard.read(()->ports.windows(guard));
            if (windows==null || windows.isEmpty()) throw new Limit(7);
            if (windows.size()>8) throw new Limit(3);
            HashSet<Integer> ids=new HashSet<>(); int systemRoots=0;
            for (Object window:windows) {
                if (window==null) throw new Limit(7);
                int[] info=guard.read(()->ports.window(window,guard));
                if (info==null || info.length!=10 || info[0]<0 || info[1]<1 || info[1]>6 || info[2]<0 || !ids.add(info[0]) || info[3]!=0 || info[8]<info[6] || info[9]<info[7]) throw new Limit(8);
                if (distinct.size()>=512) throw new Limit(4);
                Object root=guard.read(()->ports.root(window,guard));
                if (root==null) throw new Limit(7);
                if (!distinct.add(root)) throw new Limit(6);
                int[] identity=guard.read(()->ports.rootIdentity(root,guard));
                if (identity==null || identity.length!=2 || identity[0]!=info[0] || identity[1]<0 || identity[1]>3) throw new Limit(8);
                int[] row=Arrays.copyOf(info,12);row[10]=identity[1];row[11]=identity[0];
                before.add(row);result.windows.add(row);roots.add(root);
                if (identity[1]!=2) continue; // Never read another package's node text/tree.
                systemRoots++;
                List<Entry> queue=new ArrayList<>();queue.add(new Entry(root,-1,0,info[0]));
                for (int cursor=0;cursor<queue.size();cursor++) {
                    guard.check();Entry entry=queue.get(cursor);
                    Node node=guard.read(()->ports.node(entry.node,guard));
                    if (node==null || node.window!=entry.window || node.packageKind<0 || node.packageKind>3 || node.classKind<0 || node.classKind>6 || node.resourceKind<0 || node.resourceKind>19 || node.flags<0 || node.flags>15 || node.matches<0 || node.matches>63 || node.bounds==null || node.bounds.length!=4 || node.bounds[2]<node.bounds[0] || node.bounds[3]<node.bounds[1]) throw new Limit(8);
                    if (node.children<0 || node.children>64 || (entry.depth==12 && node.children>0)) throw new Limit(5);
                    int index=result.nodes.size();
                    result.nodes.add(new int[]{index,entry.parent,entry.depth,node.window,node.packageKind,node.classKind,node.resourceKind,node.bounds[0],node.bounds[1],node.bounds[2],node.bounds[3],node.flags,node.matches,node.children});
                    for (int i=0;i<node.children;i++) {
                        final int childIndex=i;
                        if (distinct.size()>=512) throw new Limit(4);
                        Object child=guard.read(()->ports.child(entry.node,childIndex,guard));
                        if (child==null) throw new Limit(7);
                        if (!distinct.add(child)) throw new Limit(6);
                        queue.add(new Entry(child,index,entry.depth+1,entry.window));
                    }
                }
            }
            if (systemRoots==0) throw new Limit(7);
            // Inventory/root identity recheck only; never a second tree traversal.
            List<Object> after=guard.read(()->ports.windows(guard));
            if (after==null || after.size()!=before.size()) throw new Limit(11);
            HashSet<Integer> checked=new HashSet<>();
            for (Object window:after) {
                int[] info=guard.read(()->ports.window(window,guard));
                if (info==null || info.length!=10 || !checked.add(info[0])) throw new Limit(11);
                int index=-1;for(int i=0;i<before.size();i++)if(before.get(i)[0]==info[0])index=i;
                if(index<0 || !Arrays.equals(info,Arrays.copyOf(before.get(index),10)))throw new Limit(11);
                if(distinct.size()>=512)throw new Limit(4);
                Object root=guard.read(()->ports.root(window,guard));
                if(root==null || !root.equals(roots.get(index)))throw new Limit(11);
                int[] identity=guard.read(()->ports.rootIdentity(root,guard));
                if(identity==null || identity.length!=2 || identity[0]!=before.get(index)[11] || identity[1]!=before.get(index)[10])throw new Limit(11);
            }
            result.notificationAfter=guard.read(()->ports.currentNotification(guard));
            if (!result.notificationAfter) throw new Limit(10);
            guard.check();
        } catch (Limit limit) { result.reason=limit.reason; }
        catch (Throwable failure) { result.reason=13; }
        finally {
            try { result.restored=ports.close(); } catch (Throwable failure) { result.restored=false; }
            result.finished=clock.uptime();result.finishedElapsed=clock.elapsed();result.reads=guard.reads;
            if (!result.restored && result.reason==0) result.reason=9;
            if ((result.finished>=result.end || result.finishedElapsed>=result.endElapsed) && result.reason==0) result.reason=1;
            result.complete=result.reason==0 && result.notificationBefore && result.notificationAfter && result.restored;
        }
        return result;
    }
}
