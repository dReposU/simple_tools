- [] Update index of the references [1], [2], ...
- [] Given a .md (or maybe can be an integrated extension) search for citations. Citations must follow this format _[#]_ where # is a number. Also these must be before a given heading like `# References`. When updating the index the program must be aware of citations.  

- [] Changing order of references. 

**Absolute order:**
Given  
[1] F  
[2] G  
[3] H  
[4] I  

Spaces will be considered as places to insert, i.e.

_Pos 0_
[1] F 
_Pos 1_ 
[2] G 
_Pos 2_ 
[3] H 
_Pos 3_ 
[4] I 
_Pos 4_ 

The syntax must be -1 and there can be a suborder like -1.0. E.g.

**Input:**  

[1-4] F  
[2-0.2] G  
[3] H  
[4-0.1] I 

**Output:**  

[1] I 
[2] G  
[3] H  
[4] F  

